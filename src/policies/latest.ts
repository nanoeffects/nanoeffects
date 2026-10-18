import type { Context } from "../bus";
import { createSettle, forkTask, traceTask } from "../context";
import type { EffectName, EventMap, Task } from "../types";
import { isPromise, onAbort } from "../utils";

/**
 * Aborts the previous run when a new call arrives; stale results are dropped.
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
 * ```
 */
export const latest = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
): Task<P, E, R | Promise<Awaited<R> | undefined> | undefined> =>
	latestWith("latest", (payload, ctx, begin) => {
		begin();
		return fn(payload, ctx);
	});

/**
 * Shared core of `latest` and `debounce`. `fn` calls `begin` when the work
 * really starts: a run aborted before that is traced as `drop`, not `cancel`.
 *
 * @internal
 */
export const latestWith = <P, E extends EventMap, R>(
	effect: EffectName,
	fn: (payload: P, ctx: Context<E>, begin: () => void) => R,
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
		onAbort(() => settle(started ? "cancel" : "drop"), ctx);

		const finish = () => {
			unlink();
			if (current === ctx) {
				current = null;
			}
		};

		const returnValue = <T>(value: T): T | undefined => {
			if (ctx.signal.aborted) {
				return;
			}
			settle("done");
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
