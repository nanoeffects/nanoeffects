export type Cancellable = {
	abort: (reason?: unknown) => void;
};

/**
 * Aborts the task / handle in `ctx` (no-op if already aborted).
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 * cancel(controller, "user left"); // controller.signal.reason === "user left"
 * ```
 */
export const cancel = (ctx: Cancellable, reason?: unknown): void => {
	ctx.abort(reason);
};
