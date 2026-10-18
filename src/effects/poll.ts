import { clearTimer, onAbort, setTimer, type Timer } from "../utils";
import { runTraced, withGroup } from "./group";

export type PollOptions = {
	/** Also call `fn` at once, not only after the first `ms`. Default `false`. */
	leading?: boolean;
	/**
	 * Start the pause after a call finishes, so calls never overlap. By default
	 * the calls come every `ms` whatever the duration of `fn`.
	 */
	waitForFn?: boolean;
};

/**
 * Calls `fn` every `ms`, like patronum `interval`: the first call comes after
 * `ms` (with `leading` also at once), and the next ticks keep a steady rate
 * whatever the duration of `fn`, so a slow `fn` may overlap with the next call
 * (`waitForFn` starts each pause when the call ends instead). `fn` gets the
 * number of the call, starting at 0.
 *
 * `ms` can be a function of the number of the call that the pause leads to, for
 * a growing or random pause: `(call) => Math.min(1000 * 2 ** call, 60_000)`.
 *
 * It stops when `ctx` aborts: the result then resolves, it does not reject, and
 * the pending timer is cleared. If a call throws, polling stops and the result
 * rejects.
 *
 * @example
 * ```ts
 * bus.on("watch", async (_, ctx) => {
 *   await poll(ctx, () => refresh(), 5000);
 *   cleanup(); // the task was aborted
 * });
 * ```
 */
export const poll = (
	ctx: { signal: AbortSignal },
	fn: (tick: number) => unknown,
	ms: number | ((call: number) => number),
	options: PollOptions = {},
): Promise<void> => {
	if (ctx.signal.aborted) {
		return Promise.resolve();
	}

	const leading = options.leading ?? false;
	const waitForFn = options.waitForFn ?? false;

	return withGroup(
		"poll",
		ctx,
		(group) =>
			// it never fulfils: it ends by an abort or by an error of `fn`
			new Promise<void>((_, reject) => {
				let started = 0;
				let timer: Timer | null = null;

				const stop = () => {
					if (timer !== null) {
						clearTimer(timer);
						timer = null;
					}
				};
				// `next` is the number of the call this pause leads to
				const schedule = (next: number) => {
					try {
						timer = setTimer(onTimer, typeof ms === "function" ? ms(next) : ms);
					} catch (error) {
						stop();
						reject(error);
					}
				};
				const onTimer = () => {
					timer = null;
					if (!waitForFn) {
						schedule(started + 1);
					}
					call();
				};
				const call = () => {
					const tick = started++;
					runTraced(group, () => fn(tick)).then(
						() => {
							if (waitForFn && !group.signal.aborted) {
								schedule(started);
							}
						},
						(error: unknown) => {
							stop();
							reject(error);
						},
					);
				};

				onAbort(group, stop);
				if (leading) {
					call();
					if (!waitForFn) {
						schedule(started);
					}
				} else {
					schedule(0);
				}
			}),
	).catch((error: unknown) => {
		if (!ctx.signal.aborted) {
			throw error;
		}
	});
};
