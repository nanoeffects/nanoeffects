/** Logs a failure of user code (a logger, a callback) that must not break the flow. */
export const report = (message: string, error: unknown) => {
	globalThis.console?.error(`[nanoeffects] ${message}`, error);
};
