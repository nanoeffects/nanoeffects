import type { Context } from "../core/bus";
import type { EventMap, Task } from "../core/types";
import { onAbort } from "../utils";
import {
	formOf,
	type Keyed,
	type KeyOption,
	keyed,
	type Loose,
	type Unkeyed,
} from "./keyed";
import { doneCall, dropCall, endCall, startCall } from "./lifecycle";

export type DedupeOptions<P = never> = KeyOption<P>;

/** What `dedupe()` returns: it turns a task into a `dedupe` task. */
export type DedupeWrapper = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, Promise<Awaited<R> | undefined>>;

/** What `dedupe({ key })` returns: the payload type comes from `key`. */
export type KeyedDedupeWrapper<P> = <E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, Promise<Awaited<R> | undefined>>;

/**
 * Calls with the same key that come while a run is going wait for that run
 * instead of starting their own: `fn` runs once, and every caller gets its
 * result, or its error. Nothing is kept after the run settles, so this is
 * not a cache: the next call starts `fn` again.
 *
 * The key is the payload itself (compared like a `Map` key) unless
 * `options.key` says otherwise; `key: () => "all"` shares one run between
 * every call.
 *
 * The run belongs to the task of the first caller. A caller whose task aborts
 * resolves with `undefined` and the others go on; when it is the first caller
 * that aborts, the run is aborted and started again with the context of the
 * first caller that is still waiting, so `fn` may run twice for one request:
 * use it for reads, not for writes.
 *
 * @example
 * ```ts
 * bus.on(
 *   "user/load",
 *   dedupe(async (id, { signal }) => api.getUser(id, { signal })),
 * );
 *
 * bus.emit("user/load", 1); // runs
 * bus.emit("user/load", 1); // waits for the first run, one request in all
 * ```
 */
export function dedupe<P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options?: DedupeOptions<P>,
): Task<P, E, Promise<Awaited<R> | undefined>>;
export function dedupe(options?: Unkeyed<DedupeOptions>): DedupeWrapper;
export function dedupe<P>(
	options: Keyed<DedupeOptions<P>, P>,
): KeyedDedupeWrapper<P>;
export function dedupe(first?: Loose, second?: Loose): unknown {
	return formOf(first, second, buildDedupe);
}

type Waiter<P, E extends EventMap, R> = {
	payload: P;
	ctx: Context<E>;
	resolve: (value: Awaited<R> | undefined) => void;
	reject: (error: unknown) => void;
	stop: () => void;
};

const samePayload = <P>(payload: P) => payload;

const buildDedupe = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options: DedupeOptions<P>,
): Task<P, E, Promise<Awaited<R> | undefined>> => {
	const create = (onIdle: () => void) => createDedupe(fn, onIdle);

	return keyed(options.key ?? samePayload, create);
};

const createDedupe = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	onIdle: () => void,
): Task<P, E, Promise<Awaited<R> | undefined>> => {
	// the first one is the owner of the run, the others wait for it
	const waiters: Waiter<P, E, R>[] = [];
	// tells the run that is going from one that was given up after an abort
	let generation = 0;

	const finish = (
		mine: number,
		settled: { value: Awaited<R> } | { error: unknown },
	) => {
		if (mine !== generation) {
			return;
		}
		const [owner] = waiters;
		if (owner) {
			doneCall(owner.ctx, settled);
		}
		const all = waiters.splice(0);
		for (const waiter of all) {
			waiter.stop();
			if (waiter !== owner) {
				// the job hears of a run once: the ones that waited did not start anything
				dropCall(waiter.ctx, "dedupe");
			}
		}
		onIdle();
		for (const waiter of all) {
			if ("error" in settled) {
				waiter.reject(settled.error);
			} else {
				waiter.resolve(settled.value);
			}
		}
	};

	const begin = () => {
		const [owner] = waiters;
		if (!owner) {
			return;
		}
		generation++;
		const mine = generation;
		let outcome: Promise<Awaited<R>>;
		try {
			outcome = Promise.resolve(
				startCall(owner.ctx, "dedupe", () => fn(owner.payload, owner.ctx)),
			);
		} catch (error) {
			outcome = Promise.reject(error);
		}
		outcome.then(
			(value) => finish(mine, { value }),
			(error: unknown) => finish(mine, { error }),
		);
	};

	const leave = (waiter: Waiter<P, E, R>, reason: unknown) => {
		const index = waiters.indexOf(waiter);
		if (index < 0) {
			return;
		}
		waiters.splice(index, 1);
		waiter.resolve(void 0);
		// the run of an owner is aborted with its task: whatever it returns is ignored
		endCall(waiter.ctx, index === 0, reason);
		if (index !== 0) {
			return;
		}
		generation++;
		if (waiters.length > 0) {
			begin();
		} else {
			onIdle();
		}
	};

	return (payload, ctx) =>
		new Promise<Awaited<R> | undefined>((resolve, reject) => {
			if (ctx.signal.aborted) {
				resolve(void 0);
				return;
			}
			const waiter: Waiter<P, E, R> = {
				payload,
				ctx,
				resolve,
				reject,
				stop: onAbort(ctx, (reason) => leave(waiter, reason)),
			};
			waiters.push(waiter);
			if (waiters.length === 1) {
				begin();
			}
		});
};
