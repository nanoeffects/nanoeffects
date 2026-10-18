import { onAbort } from "./onAbort";

/**
 * Resolves after `ms`, or rejects early if `ctx.signal` aborts.
 *
 * @example
 * ```ts
 * await delay(500);
 *
 * // inside a task: stops waiting when the task is aborted
 * bus.on("retry", async (_, ctx) => {
 *   await delay(1000, ctx);
 *   await load();
 * });
 * ```
 */
export const delay = (ms: number, ctx?: { signal?: AbortSignal }) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			off();
			resolve();
		}, ms);
		const off = onAbort((reason) => {
			clearTimeout(timer);
			reject(reason);
		}, ctx);
	});
