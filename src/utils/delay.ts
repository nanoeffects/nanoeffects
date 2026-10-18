import { onAbort } from "./onAbort";

/**
 * Resolves after `ms`, or rejects early if `ctx.signal` aborts. `ms` can be a
 * function that returns the number of ms, called once when the delay starts:
 * handy for a random pause (jitter).
 *
 * @example
 * ```ts
 * await delay({}, 500);
 *
 * // 200 to 400 ms
 * await delay({}, () => 200 + Math.random() * 200);
 *
 * // inside a task: stops waiting when the task is aborted
 * bus.on("retry", async (_, ctx) => {
 *   await delay(ctx, 1000);
 *   await load();
 * });
 * ```
 */
export const delay = (
	ctx: { signal?: AbortSignal | undefined },
	ms: number | (() => number),
) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(
			() => {
				off();
				resolve();
			},
			typeof ms === "function" ? ms() : ms,
		);
		const off = onAbort(ctx, (reason) => {
			clearTimeout(timer);
			reject(reason);
		});
	});
