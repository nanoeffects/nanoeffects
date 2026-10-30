import type { Context } from "../core/bus";
import { createSettle, forkTask, traceTask } from "../core/context";
import type { EffectName, EventMap, Task } from "../core/types";
import { isPromise, onAbort } from "../utils";
import {
	formOf,
	type Keyed,
	type KeyOption,
	keyed,
	type Loose,
	noop,
	type Unkeyed,
} from "./keyed";
import { endCall, startCallOf } from "./lifecycle";

export type LatestOptions<P = never> = KeyOption<P>;

type LatestResult<R> = R | Promise<Awaited<R> | undefined> | undefined;

/** What `latest()` returns: it turns a task into a `latest` task. */
export type LatestWrapper = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, LatestResult<R>>;

/** What `latest({ key })` returns: the payload type comes from `key`. */
export type KeyedLatestWrapper<P> = <E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, LatestResult<R>>;

/**
 * Aborts the previous run when a new call arrives; stale results are dropped.
 * With `options.key` each key has its own latest run.
 *
 * Called without the task, `latest()` returns a function that takes the task,
 * so `usePolicy(callback, latest())` has no `(task) => ...` to get wrong.
 *
 * @example
 * ```ts
 * bus.on(
 *   "search",
 *   latest(async (query, { signal }) => {
 *     const res = await fetch(`/api?q=${query}`, { signal });
 *     showResults(await res.json());
 *   }),
 * );
 *
 * bus.emit("search", "re"); // aborted by the next call
 * bus.emit("search", "redux"); // only this one finishes
 *
 * // one latest run per user instead of one for all
 * bus.on("load", latest(loadUser, { key: (user) => user.id }));
 *
 * // without the task: for a hook that builds the task itself
 * const search = usePolicy(runSearch, latest());
 * ```
 */
export function latest<P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options?: LatestOptions<P>,
): Task<P, E, LatestResult<R>>;
export function latest(options?: Unkeyed<LatestOptions>): LatestWrapper;
export function latest<P>(
	options: Keyed<LatestOptions<P>, P>,
): KeyedLatestWrapper<P>;
export function latest(first?: Loose, second?: Loose): unknown {
	return formOf(first, second, buildLatest);
}

const buildLatest = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options: LatestOptions<P>,
): Task<P, E, LatestResult<R>> => {
	const create = (onIdle: () => void) =>
		latestWith<P, E, R>(
			"latest",
			(payload, ctx, begin) => {
				begin();
				return fn(payload, ctx);
			},
			onIdle,
		);

	return keyed(options.key, create);
};

/**
 * Shared core of `latest` and `debounce`. `fn` calls `begin` when the work
 * really starts: a run that ends before that is traced as `drop`, not `cancel`
 * or `done`. `onIdle` is called when no run is left.
 *
 * @internal
 */
export const latestWith = <P, E extends EventMap, R>(
	effect: EffectName,
	fn: (payload: P, ctx: Context<E>, begin: () => void) => R,
	onIdle: () => void = noop,
): Task<P, E, R | Promise<Awaited<R> | undefined> | undefined> => {
	let current: Context<E> | null = null;

	return (payload, parent) => {
		current?.abort();

		if (parent.signal.aborted) {
			return;
		}

		const { ctx, unlink } = forkTask(parent);
		current = ctx;

		const settle = createSettle(ctx, effect);
		let started = false;
		const begin = () => {
			if (!ctx.signal.aborted) {
				started = true;
				startCallOf(ctx);
				traceTask(ctx, effect, "start");
			}
		};
		onAbort(ctx, (reason) => {
			endCall(ctx, started, reason);
			settle(started ? "cancel" : "drop");
		});

		const finish = () => {
			unlink();
			if (current === ctx) {
				current = null;
				onIdle();
			}
		};

		const returnValue = <T>(value: T): T | undefined => {
			if (ctx.signal.aborted) {
				return;
			}
			settle(started ? "done" : "drop");
			return value;
		};

		try {
			const result = fn(payload, ctx, begin);

			if (isPromise(result)) {
				return Promise.resolve(result)
					.then(returnValue, (error: unknown): Awaited<R> | undefined => {
						if (ctx.signal.aborted) {
							return;
						}
						settle("error", error);
						throw error;
					})
					.finally(finish);
			}

			finish();

			return returnValue(result);
		} catch (error) {
			finish();
			if (ctx.signal.aborted) {
				return;
			}
			settle("error", error);
			throw error;
		}
	};
};
