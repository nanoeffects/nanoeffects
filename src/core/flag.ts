declare const __NANOEFFECTS_TRACE__: boolean | undefined;

/**
 * Whether the tracing hooks are built in. A build sets `__NANOEFFECTS_TRACE__`
 * to `false` (see the `notrace` build) and the bundler removes them; without
 * the define, as in the sources and in tests, they are on.
 */
export const TRACE =
	typeof __NANOEFFECTS_TRACE__ === "undefined" || __NANOEFFECTS_TRACE__;
