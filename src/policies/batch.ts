import type { Context } from "../core/bus";
import type { EventMap, Task } from "../core/types";
import { clearTimer, onAbort, setTimer, type Timer } from "../utils";
import {
	formOf,
	type Keyed,
	type KeyOption,
	keyed,
	type Loose,
	type Unkeyed,
} from "./keyed";
import { doneCall, dropCall, startCall } from "./lifecycle";

export type BatchOptions<P = never> = KeyOption<P> & {
	/** Send the batch at once when it holds this many payloads. Default: no limit. */
	maxSize?: number;
};

/** What `batch(ms)` returns: it turns a task that takes an array into a `batch` task. */
export type BatchWrapper = <P, E extends EventMap, R>(
	fn: Task<P[], E, R>,
) => Task<P, E, Promise<Awaited<R> | undefined>>;

/** What `batch(ms, { key })` returns: the payload type comes from `key`. */
export type KeyedBatchWrapper<P> = <E extends EventMap, R>(
	fn: Task<P[], E, R>,
) => Task<P, E, Promise<Awaited<R> | undefined>>;

/**
 * Collects the payloads of the calls that come in a window of `ms`, then
 * calls `fn` once with all of them, as an array in the order of the calls.
 * The window opens at the first call and does not move when more calls come
 * (it is not a debounce); with `options.maxSize` a full batch is sent at once.
 *
 * Every call returns a promise with what `fn` returned for its batch: the
 * same value for all of them, or the same error. `fn` gets the context of the
 * first caller that is still waiting; if its task aborts while `fn` runs, the
 * run is aborted and the callers of that batch resolve with `undefined`.
 * A call that aborts while the batch is collecting is taken out of it. With
 * `options.key` each key collects its own batch.
 *
 * @example
 * ```ts
 * bus.on(
 *   "track",
 *   batch(500, async (events) => {
 *     await api.sendEvents(events);
 *   }),
 * );
 *
 * bus.emit("track", { name: "open" });
 * bus.emit("track", { name: "click" }); // both go in one request, 500 ms later
 * ```
 */
export function batch<P, E extends EventMap, R>(
	ms: number,
	fn: Task<P[], E, R>,
	options?: BatchOptions<P>,
): Task<P, E, Promise<Awaited<R> | undefined>>;
export function batch(
	ms: number,
	options?: Unkeyed<BatchOptions>,
): BatchWrapper;
export function batch<P>(
	ms: number,
	options: Keyed<BatchOptions<P>, P>,
): KeyedBatchWrapper<P>;
export function batch(ms: number, first?: Loose, second?: Loose): unknown {
	return formOf(first, second, (fn, options) => buildBatch(ms, fn, options));
}

type Member<P, E extends EventMap, R> = {
	payload: P;
	ctx: Context<E>;
	resolve: (value: Awaited<R> | undefined) => void;
	reject: (error: unknown) => void;
	stop: () => void;
	// the run that took this payload, once the batch is sent
	run?: Run<P, E, R>;
};

type Run<P, E extends EventMap, R> = {
	members: Member<P, E, R>[];
	// the owner left: nobody gets the result
	dead: boolean;
};

// below 1 and NaN are 1 (`>=` is false for NaN); no size means no limit
const sizeOf = (maxSize: number | undefined | null): number => {
	if (typeof maxSize !== "number") {
		return Number.POSITIVE_INFINITY;
	}

	return maxSize >= 1 ? Math.floor(maxSize) : 1;
};

const buildBatch = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P[], E, R>,
	options: BatchOptions<P>,
): Task<P, E, Promise<Awaited<R> | undefined>> => {
	const maxSize = sizeOf(options.maxSize);
	const create = (onIdle: () => void) => createBatch(ms, maxSize, fn, onIdle);

	return keyed(options.key, create);
};

const createBatch = <P, E extends EventMap, R>(
	ms: number,
	maxSize: number,
	fn: Task<P[], E, R>,
	onIdle: () => void,
): Task<P, E, Promise<Awaited<R> | undefined>> => {
	let collecting: Member<P, E, R>[] = [];
	let timer: Timer | null = null;
	let running = 0;

	const checkIdle = () => {
		if (collecting.length === 0 && running === 0) {
			onIdle();
		}
	};

	const stopTimer = () => {
		if (timer) {
			clearTimer(timer);
			timer = null;
		}
	};

	const deliver = (
		run: Run<P, E, R>,
		settled: { value: Awaited<R> } | { error: unknown },
	) => {
		for (const member of run.members) {
			if ("error" in settled) {
				member.reject(settled.error);
			} else {
				member.resolve(settled.value);
			}
		}
	};

	const settleRun = (
		run: Run<P, E, R>,
		settled: { value: Awaited<R> } | { error: unknown },
	) => {
		running--;
		const [owner] = run.members;
		if (owner && !run.dead) {
			doneCall(owner.ctx, settled);
		}
		for (const member of run.members) {
			member.stop();
			if (member !== owner) {
				// the job hears of a run once: the ones that waited did not start anything
				dropCall(member.ctx, "batch");
			}
		}
		checkIdle();
		if (!run.dead) {
			deliver(run, settled);
		}
	};

	const flush = () => {
		stopTimer();
		const members = collecting;
		collecting = [];
		const [owner] = members;
		if (!owner) {
			checkIdle();
			return;
		}
		const run: Run<P, E, R> = { members, dead: false };
		for (const member of members) {
			member.run = run;
		}
		running++;
		const payloads = members.map((member) => member.payload);
		let outcome: Promise<Awaited<R>>;
		try {
			outcome = Promise.resolve(
				startCall(owner.ctx, "batch", () => fn(payloads, owner.ctx)),
			);
		} catch (error) {
			outcome = Promise.reject(error);
		}
		outcome.then(
			(value) => settleRun(run, { value }),
			(error: unknown) => settleRun(run, { error }),
		);
	};

	const leave = (member: Member<P, E, R>) => {
		const run = member.run;
		if (!run) {
			collecting.splice(collecting.indexOf(member), 1);
			dropCall(member.ctx, "batch");
			member.resolve(void 0);
			if (collecting.length === 0) {
				stopTimer();
				checkIdle();
			}
			return;
		}
		member.resolve(void 0);
		if (member === run.members[0]) {
			run.dead = true;
			for (const other of run.members) {
				other.resolve(void 0);
			}
		}
	};

	return (payload, ctx) =>
		new Promise<Awaited<R> | undefined>((resolve, reject) => {
			if (ctx.signal.aborted) {
				resolve(void 0);
				return;
			}
			const member: Member<P, E, R> = {
				payload,
				ctx,
				resolve,
				reject,
				stop: onAbort(ctx, () => leave(member)),
			};
			collecting.push(member);
			if (collecting.length >= maxSize) {
				flush();
			} else if (collecting.length === 1) {
				timer = setTimer(flush, ms);
			}
		});
};
