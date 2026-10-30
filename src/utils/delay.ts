import { isContext } from "./context-argument";
import { onAbort } from "./onAbort";
import { clearTimer, setTimer } from "./timer";

type Milliseconds = number | (() => number);

const wait = (ctx: { signal?: AbortSignal | undefined }, ms: Milliseconds) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimer(
			() => {
				off();
				resolve();
			},
			typeof ms === "function" ? ms() : ms,
		);
		const off = onAbort(ctx, (reason) => {
			clearTimer(timer);
			reject(reason);
		});
	});

/**
 * Resolves after `ms`, or rejects early if `ctx.signal` aborts. `ms` can be a
 * function that returns the number of ms, called once when the delay starts:
 * handy for a random pause (jitter).
 *
 * Without `ctx`, `delay(ms)` returns a starter for `race`, `all` and
 * `allSettled`: they call it with the context of its own child task, and it
 * waits then. It starts no timer before that, and one starter can be used in
 * several groups. Do not `await` it on its own: it is a function, not a promise.
 *
 * @example
 * ```ts
 * await delay({}, 500);
 *
 * // 200 to 400 ms
 * await delay({}, () => 200 + Math.random() * 200);
 *
 * // inside a task: stops waiting when the task is aborted
 * bus.on("retry", async (_, ctx) => {
 *   await delay(ctx, 1000);
 *   await load();
 * });
 *
 * // as a starter: the loser of the race is cancelled
 * const result = await race(ctx, {
 *   waited: delay(1000),
 *   cancelled: take(cancel),
 * });
 * ```
 */
export function delay(
	ms: Milliseconds,
): (child: { signal?: AbortSignal | undefined }) => Promise<void>;
export function delay(
	ctx: { signal?: AbortSignal | undefined },
	ms: Milliseconds,
): Promise<void>;
export function delay(
	first: Milliseconds | { signal?: AbortSignal | undefined },
	second?: Milliseconds,
): unknown {
	if (isContext(first)) {
		const ms = second as Milliseconds;

		return wait(first, ms);
	}

	return (child: { signal?: AbortSignal | undefined }) => wait(child, first);
}
