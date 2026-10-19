import type { Context } from "../core/bus";
import { createSettle, forkTask, traceTask } from "../core/context";
import type { EffectName, EventMap, Task } from "../core/types";
import { isPromise, onAbort } from "../utils";
import { type KeyOption, keyed, noop } from "./keyed";

export type LatestOptions<P = never> = KeyOption<P>;

/**
 * Aborts the previous run when a new call arrives; stale results are dropped.
 * With `options.key` each key has its own latest run.
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
 * ```
 */
export const latest = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options: LatestOptions<P> = {},
): Task<P, E, R | Promise<Awaited<R> | undefined> | undefined> => {
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
				traceTask(ctx, effect, "start");
			}
		};
		onAbort(ctx, () => settle(started ? "cancel" : "drop"));

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
