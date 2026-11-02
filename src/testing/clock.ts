/** What the runner needs from time: move it forward, and read it. */
export type Clock = {
	/** Moves time forward by `ms` and lets the timers and the promises of that time run. */
	advance(ms: number): void | Promise<void>;
	/** The time now, in milliseconds. */
	now(): number;
};

/** The part of `vi` (Vitest) and `jest` (Jest) that `fakeTimersClock` uses. */
export type FakeTimers = {
	advanceTimersByTimeAsync(ms: number): Promise<unknown>;
};

/**
 * A clock over fake timers. The test turns them on itself (`vi.useFakeTimers()`), and leaves `Date`
 * faked, which is the default, because the clock reads `Date.now()`.
 *
 * @example
 * ```ts
 * import { vi } from "vitest";
 * import { fakeTimersClock } from "nanoeffects/testing";
 *
 * vi.useFakeTimers();
 * const clock = fakeTimersClock(vi);
 * ```
 */
export const fakeTimersClock = (timers: FakeTimers): Clock => ({
	advance: (ms) => timers.advanceTimersByTimeAsync(ms).then(() => {}),
	now: () => Date.now(),
});
