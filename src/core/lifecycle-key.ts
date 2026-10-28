/**
 * Where `createJob` puts, on the context of a call, what the policies (`latest`,
 * `leading`, ...) tell it about that call. A plain symbol, shared by import, that
 * `createBus` does not import. It is not on the public `Context` type.
 */
export const callLifecycle = Symbol();

/** Set on the task of a policy: a job that wraps it waits for its reports. */
export const reportsLifecycle = Symbol();

/** What a policy tells the job around it; each report counts for the first time only. */
export type Lifecycle = {
	/** The handler really starts: the job sends `pending`. */
	start: () => void;
	/** The call ended without ever starting: the job sends nothing. */
	drop: () => void;
	/** A call that started is cancelled by the policy: the job sends `cancel`. */
	cancel: (reason: unknown) => void;
	/**
	 * The handler settled, and the policy is about to start the next call: the job
	 * closes this one now, so its outcome comes before the next `pending`.
	 */
	done: (settled: { value: unknown } | { error: unknown }) => void;
};
