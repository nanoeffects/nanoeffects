/**
 * Calls `fn` with the abort reason when `ctx.signal` aborts, at most once;
 * at once if it is already aborted. Returns a function that removes the
 * subscription.
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
	ctx: { signal: AbortSignal },
): (() => void) => {
	const { signal } = ctx;

	if (signal.aborted) {
		fn(signal.reason);
		return () => {};
	}

	const listener = () => fn(signal.reason);
	signal.addEventListener("abort", listener, { once: true });

	return () => signal.removeEventListener("abort", listener);
};
