// The call that `bus.emit` is running now, for the tracer to read what the call carries
// (its `traceGroupId`). Set by `tracePlugin` for the synchronous time of an emit, as
// `currentEmitter()` of `context.ts` is. `createBus` does not import this file.
let current: unknown;

/** The call that is being emitted, or nothing when `tracePlugin` is not used or no emit is running. */
export const callBeingEmitted = () => current;

/** Runs `fn` with `call` as the call being emitted, and puts the outer one back after it, also when it throws. */
export const withCall = <R>(call: unknown, fn: () => R): R => {
	const outer = current;
	current = call;
	try {
		return fn();
	} finally {
		current = outer;
	}
};
