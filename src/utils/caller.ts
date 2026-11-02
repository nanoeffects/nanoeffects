// The place where a listener was registered, for `tracePlugin({ source: true })`.
//
// A method that wraps `on` or `once` calls `withCaller` directly in its own body. The outermost one
// reads the stack once and holds it for the synchronous time of the call, so the wrappers below it
// leave it as it is and the plugin finds the frame of the user's call two lines down: `withCaller`,
// the wrapper, then the caller.

let wanted = false;
let slot: string | undefined;

/** Asks the wrappers to read a stack. `tracePlugin({ source: true })` calls it; nothing else needs to. */
export const wantCaller = (on = true) => {
	wanted = on;
};

/** The stack that the outermost wrapper of the call in progress holds. */
export const takeCaller = () => slot;

/**
 * The stack of the call that is being made, for a wrapper that keeps it for later (a held `on`):
 * the one that a wrapper above holds, or else its own. Call it directly in the body of the
 * wrapper, like `withCaller`.
 */
export const callerStack = () => {
	if (!wanted) {
		return;
	}

	return slot ?? new Error().stack;
};

/**
 * Runs `call` with the stack of the caller held, when the plugin asked for it and no wrapper above
 * has held one yet. `saved` is a stack that was kept earlier: it replaces the held one for the
 * time of `call`, and the held one comes back after.
 *
 * @example
 * ```ts
 * bus.on = (event, handler, options) =>
 *   withCaller(() => previous(event, handler, options));
 * ```
 */
export const withCaller = <R>(call: () => R, saved?: string): R => {
	if (!wanted || (slot !== void 0 && saved === void 0)) {
		return call();
	}
	const outer = slot;
	slot = saved ?? new Error().stack;
	try {
		return call();
	} finally {
		slot = outer;
	}
};
