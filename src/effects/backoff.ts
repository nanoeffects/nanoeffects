export type BackoffOptions = {
	/** Pause before the second attempt, in ms. Default 100. */
	base?: number;
	/** How many times each pause is longer than the one before. Default 2. */
	factor?: number;
	/** Longest pause, in ms. Default `Infinity`. */
	max?: number;
	/**
	 * Use a random pause from 0 up to the computed one ("full jitter"), so
	 * clients that failed together do not retry together. Default `false`.
	 */
	jitter?: boolean;
};

// a negative or NaN wait is 0, as for the timers of the library
const wait = (ms: number) => (ms > 0 ? ms : 0);

/**
 * Builds the `delay` of `retry`: the pause grows as `base * factor ** (attempt - 1)`
 * and never passes `max`. `retry` counts attempts from 1; `poll` counts calls from
 * 0, so there the first pause is `base / factor`.
 *
 * @example
 * ```ts
 * bus.on(
 *   "load",
 *   retry(loadUser, {
 *     times: 5,
 *     delay: backoff({ base: 200, max: 5000, jitter: true }), // 200, 400, 800, ... up to 5 s, randomised
 *   }),
 * );
 * ```
 */
export const backoff = (options: BackoffOptions = {}) => {
	const base = wait(options.base ?? 100);
	const factor = options.factor ?? 2;
	const max = wait(options.max ?? Number.POSITIVE_INFINITY);
	const jitter = options.jitter ?? false;

	return (attempt: number): number => {
		// a negative or NaN `factor` must not give a negative or NaN pause
		const pause = wait(Math.min(max, base * factor ** (attempt - 1)));

		// 0 * Infinity is NaN: a pause that overflowed and a random 0 must still be a number
		return jitter ? Math.random() * pause || 0 : pause;
	};
};
