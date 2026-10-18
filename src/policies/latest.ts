import type { Task } from "../task";
import type { EventMap } from "../types";
import { isPromise } from "../util";

/** Aborts the previous run when a new call arrives; stale results are dropped. */
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

		const controller = new AbortController();
		current = controller;

		const onParentAbort = () => controller.abort(parent?.reason);
		parent?.addEventListener("abort", onParentAbort, { once: true });

		const finish = () => {
			parent?.removeEventListener("abort", onParentAbort);
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
