import { delay } from "../utils";
import { runTraced, withGroup } from "./group";

export type RetryOptions = {
	/** Total number of attempts, the first one included. Default 3. */
	times?: number;
	/**
	 * Pause before the next attempt, in ms: a number, or a function of the
	 * number of the attempt that just failed and its error. Default 0.
	 */
	delay?: number | ((attempt: number, error: unknown) => number);
	/** Return `false` to stop retrying and throw `error`. Default: always retry. */
	shouldRetry?: (error: unknown, attempt: number) => boolean;
};

/**
 * Calls `fn` until it succeeds or `times` attempts are used, then throws the
 * last error. `fn` gets the number of the attempt, starting at 1. If `ctx`
 * aborts, retrying stops and the result rejects with the abort reason.
 *
 * @example
 * ```ts
 * bus.on("load", async (id, ctx) => {
 *   const user = await retry(ctx, () => fetchUser(id, { signal: ctx.signal }), {
 *     times: 4,
 *     delay: (attempt) => 2 ** attempt * 100,
 *   });
 * });
 * ```
 */
export const retry = <T>(
	ctx: { signal?: AbortSignal },
	fn: (attempt: number) => T | PromiseLike<T>,
	options: RetryOptions = {},
): Promise<T> =>
	withGroup("retry", ctx, async (group) => {
		const { times = 3, delay: wait = 0, shouldRetry = () => true } = options;

		for (let attempt = 1; ; attempt++) {
			try {
				return await runTraced(group, () => fn(attempt));
			} catch (error) {
				group.signal.throwIfAborted();
				if (attempt >= times || !shouldRetry(error, attempt)) {
					throw error;
				}

				const ms = typeof wait === "function" ? wait(attempt, error) : wait;
				if (ms > 0) {
					await delay(group, ms);
				}
			}
		}
	});
