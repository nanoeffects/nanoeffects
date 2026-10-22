import type { Context } from "../core/bus";
import type { EventMap, Task } from "../core/types";
import { delay } from "../utils";
import { bodyOf, runTraced, withGroup } from "./group";

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

const pauseFor = (
	wait: NonNullable<RetryOptions["delay"]>,
	attempt: number,
	error: unknown,
) => (typeof wait === "function" ? wait(attempt, error) : wait);

type Settings = Required<RetryOptions>;

const settingsOf = (options: RetryOptions): Settings => ({
	times: options.times ?? 3,
	delay: options.delay ?? 0,
	shouldRetry: options.shouldRetry ?? (() => true),
});

// What `retry` does for both of its forms: `attempt` runs one try in the context of its own
const retryBody = <T>(
	ctx: { signal?: AbortSignal },
	attempt: (child: Context<EventMap>, number: number) => T | PromiseLike<T>,
	options: RetryOptions,
): Promise<T> =>
	withGroup("retry", ctx, async (group) => {
		const { times, delay: wait, shouldRetry } = settingsOf(options);

		for (let number = 1; ; number++) {
			try {
				return await runTraced(group, (child) => attempt(child, number));
			} catch (error) {
				group.signal.throwIfAborted();
				// `!(number < times)`, not `>=`: a NaN `times` must stop after the first call, not retry forever
				if (!(number < times) || !shouldRetry(error, number)) {
					throw error;
				}

				const ms = pauseFor(wait, number, error);
				if (ms > 0) {
					await delay(group, ms);
				}
			}
		}
	});

/**
 * Calls a function until it succeeds or `times` attempts are used, then throws
 * the last error. If the caller aborts, retrying stops and the result rejects
 * with the abort reason. Two forms:
 *
 * - `retry(task, options)` wraps a Task `(payload, ctx) => result` and returns
 *   a Task. Each attempt gets a context of its own, a child of the caller's, so
 *   it can go straight into `on` and into `ctx.run`:
 *   `bus.on("load", latest(retry(load, { times: 4 })))`. The number of the
 *   attempt is not passed; use the other form when it is needed.
 * - `retry(ctx, fn, options)` is for one call inside a body. `fn` gets the
 *   number of the attempt, starting at 1.
 *
 * @example
 * ```ts
 * bus.on("load", latest(retry(loadUser, { times: 4, delay: (attempt) => 2 ** attempt * 100 })));
 *
 * bus.on("load", async (id, ctx) => {
 *   const user = await retry(ctx, () => fetchUser(id, { signal: ctx.signal }), { times: 4 });
 * });
 * ```
 */
type RetryFn<T> = (attempt: number) => T | PromiseLike<T>;

export function retry<P, E extends EventMap, R>(
	task: Task<P, E, R>,
	options?: RetryOptions,
): Task<P, E, Promise<Awaited<R>>>;
export function retry<T>(
	ctx: { signal?: AbortSignal },
	fn: RetryFn<T>,
	options?: RetryOptions,
): Promise<T>;
export function retry(
	first: object,
	second?: RetryOptions | RetryFn<unknown>,
	third: RetryOptions = {},
): unknown {
	if (typeof first === "function") {
		const task = first as Task<unknown, EventMap, unknown>;

		return (payload: unknown, ctx: Context<EventMap>) =>
			retryBody(ctx, bodyOf(task, payload), (second as RetryOptions) ?? {});
	}
	const fn = second as RetryFn<unknown>;

	return retryBody(first, (_, number) => fn(number), third);
}
