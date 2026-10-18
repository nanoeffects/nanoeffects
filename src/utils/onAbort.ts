/**
 * Calls `fn` with the abort reason when `ctx.signal` aborts, at most once;
 * at once if it is already aborted. Returns a function that removes the
 * subscription. Does nothing without a signal.
 *
 * @example
 * ```ts
 * bus.on("connect", (url, ctx) => {
 *   const socket = new WebSocket(url);
 *   onAbort(() => socket.close(), ctx);
 * });
 * ```
 */
export const onAbort = (
	fn: (reason: unknown) => void,
	ctx?: { signal?: AbortSignal | undefined },
): (() => void) => {
	const signal = ctx?.signal;
	const listener = () => fn(signal?.reason);

	if (signal?.aborted) {
		listener();
	} else {
		signal?.addEventListener("abort", listener, { once: true });
	}

	return () => signal?.removeEventListener("abort", listener);
};
