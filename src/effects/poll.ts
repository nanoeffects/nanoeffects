import type { Context, WithSignal } from "../core/bus";
import type { EventMap, Task } from "../core/types";
import { clearTimer, onAbort, setTimer, type Timer } from "../utils";
import { bodyOf, runTraced, withGroup } from "./group";
import { runTaskOrStarter, type Startable } from "./starter-call";

export type PollOptions = {
	/** Also call `fn` at once, not only after the first `ms`. Default `false`. */
	leading?: boolean;
	/**
	 * Start the pause after a call finishes, so calls never overlap. By default
	 * the calls come every `ms` whatever the duration of `fn`.
	 */
	waitForFn?: boolean;
};

// What `poll` does for both of its forms: `call` runs one call in the context of its own
const pollBody = (
	ctx: WithSignal,
	call: (child: Context<EventMap>, tick: number) => unknown,
	ms: number | ((call: number) => number),
	options: PollOptions,
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
					callOnce();
				};
				const callOnce = () => {
					const tick = started++;
					runTraced(group, (child) => call(child, tick)).then(
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
					callOnce();
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

/**
 * Calls a function every `ms`, like patronum `interval`: the first call comes
 * after `ms` (with `leading` also at once), and the next ticks keep a steady
 * rate whatever the duration of the function, so a slow one may overlap with
 * the next call (`waitForFn` starts each pause when the call ends instead). An
 * error stops the polling and rejects; an abort of the caller ends it without
 * an error and clears the timer. Two forms:
 *
 * - `poll(ms, task, options)` wraps a Task `(payload, ctx) => result` and
 *   returns a Task. Each call gets a context of its own, a child of the
 *   caller's: `bus.on("watch", poll(10_000, refresh))`.
 * - `poll(ctx, fn, ms, options)` is for one call inside a body; `fn` gets the
 *   number of the call, starting at 0.
 *
 * `ms` can be a function of the number of the call that the pause leads to, for
 * a growing or random pause: `(call) => Math.min(1000 * 2 ** call, 60_000)`.
 *
 * @example
 * ```ts
 * bus.on("watch", poll(10_000, (_, { signal }) => refresh({ signal })));
 *
 * bus.on("watch", async (_, ctx) => {
 *   await poll(ctx, () => refresh(), 10_000);
 * });
 * ```
 */
type PollMs = number | ((call: number) => number);

export function poll<P, E extends EventMap, R>(
	ms: PollMs,
	task: Task<P, E, R>,
	options?: PollOptions,
): Startable<P, E, Promise<void>>;
export function poll(
	ctx: WithSignal,
	fn: (tick: number) => unknown,
	ms: PollMs,
	options?: PollOptions,
): Promise<void>;
export function poll(
	first: PollMs | WithSignal,
	second: Task<unknown, EventMap, unknown> | ((tick: number) => unknown),
	third?: PollMs | PollOptions,
	fourth: PollOptions = {},
): unknown {
	if (typeof first !== "object") {
		const task = second as Task<unknown, EventMap, unknown>;
		const options = (third ?? {}) as PollOptions;

		const run = (ctx: Context<EventMap>, payload: unknown) =>
			pollBody(ctx, bodyOf(task, payload), first, options);

		return (payload: unknown, ctx?: Context<EventMap>) =>
			runTaskOrStarter(payload, ctx, run);
	}
	const fn = second as (tick: number) => unknown;
	const ms = third as PollMs;

	return pollBody(first, (_, tick) => fn(tick), ms, fourth);
}
