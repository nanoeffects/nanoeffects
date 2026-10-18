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
		const signal = ctx?.signal;

		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}

		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);

		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
