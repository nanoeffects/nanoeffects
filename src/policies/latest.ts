import type { EventMap, Task } from "../types";
import { isPromise, linkedController } from "../utils";

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
): Task<P, E, R | Promise<Awaited<R> | undefined> | undefined> => {
	let current: AbortController | null = null;

	return (payload, ctx) => {
		current?.abort();

		const parent = ctx?.signal;
		if (parent?.aborted) {
			return;
		}

		const { controller, unlink } = linkedController(parent);
		current = controller;

		const finish = () => {
			unlink();
			if (current === controller) {
				current = null;
			}
		};

		const returnValue = <T>(value: T): T | undefined => {
			if (controller.signal.aborted) {
				return;
			}
			return value;
		};

		try {
			const result = fn(payload, { ...ctx, signal: controller.signal });

			if (isPromise(result)) {
				return Promise.resolve(result)
					.then(returnValue, (error: unknown): Awaited<R> | undefined => {
						if (controller.signal.aborted) {
							return;
						}
						throw error;
					})
					.finally(finish);
			}

			finish();

			return returnValue(result);
		} catch (error) {
			finish();
			if (controller.signal.aborted) {
				return;
			}
			throw error;
		}
	};
};
