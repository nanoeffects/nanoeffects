// Timers: setTimeout limits (a wait over 2^31 - 1 ms fires at once).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { delay, poll, timeout } from "../effects";
import { debounce, throttle } from "../policies";
import { createHarness, deferred, type TestEvents } from "./test-helpers";

describe("regressions: timers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const DAY = 86_400_000;
	const MAX = 2 ** 31 - 1;

	describe("a wait over 2^31 - 1 ms (24.8 days) must not fire at once", () => {
		it("delay waits for the whole time", async () => {
			const done = vi.fn();
			delay({}, 40 * DAY).then(done);
			await vi.advanceTimersByTimeAsync(30 * DAY);
			expect(done).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(10 * DAY);

			expect(done).toHaveBeenCalledTimes(1);
		});

		it("delay does not fire after 1 ms either", async () => {
			const done = vi.fn();
			delay({}, MAX + 1000).then(done);
			await vi.advanceTimersByTimeAsync(5);

			expect(done).not.toHaveBeenCalled();
		});

		it("delay can still be aborted, and then leaves no timer", async () => {
			const controller = new AbortController();
			const promise = delay(controller, 40 * DAY);
			const assertion = expect(promise).rejects.toBe("stop");
			await vi.advanceTimersByTimeAsync(30 * DAY);
			controller.abort("stop");

			await assertion;
			expect(vi.getTimerCount()).toBe(0);
		});

		it("timeout does not expire at once", async () => {
			const starter = deferred<string>();
			const promise = timeout({}, 40 * DAY, () => starter.promise);
			await vi.advanceTimersByTimeAsync(5);
			starter.resolve("done");

			await expect(promise).resolves.toBe("done");
		});

		it("debounce waits for the whole time", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			debounce<number, TestEvents, void>(40 * DAY, handler)(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(30 * DAY);
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(10 * DAY);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("throttle holds a call for the whole window", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const throttled = throttle<number, TestEvents, void>(40 * DAY, handler);
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(30 * DAY);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(10 * DAY);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("poll ticks only once the whole time has passed", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			poll(controller, handler, 40 * DAY);
			await vi.advanceTimersByTimeAsync(30 * DAY);
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(10 * DAY);
			controller.abort();

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("an infinite wait never ends", () => {
		it("delay(Infinity) stays pending, and an abort still ends it", async () => {
			const controller = new AbortController();
			const done = vi.fn();
			const promise = delay(controller, Number.POSITIVE_INFINITY);
			promise.then(done, () => {});
			await vi.advanceTimersByTimeAsync(1000 * DAY);
			expect(done).not.toHaveBeenCalled();
			controller.abort();

			await expect(promise).rejects.toBeDefined();
		});

		it("timeout(Infinity) is no timeout", async () => {
			const starter = deferred<string>();
			const promise = timeout(
				{},
				Number.POSITIVE_INFINITY,
				() => starter.promise,
			);
			await vi.advanceTimersByTimeAsync(1000 * DAY);
			starter.resolve("late but fine");

			await expect(promise).resolves.toBe("late but fine");
		});

		it("leaves no timer behind", async () => {
			const controller = new AbortController();
			delay(controller, Number.POSITIVE_INFINITY).catch(() => {});

			expect(vi.getTimerCount()).toBe(0);
			controller.abort();
		});
	});

	describe("odd waits", () => {
		it("a negative wait is like zero", async () => {
			const done = vi.fn();
			delay({}, -50).then(done);
			await vi.advanceTimersByTimeAsync(0);

			expect(done).toHaveBeenCalledTimes(1);
		});

		it("NaN is like zero", async () => {
			const done = vi.fn();
			delay({}, Number.NaN).then(done);
			await vi.advanceTimersByTimeAsync(0);

			expect(done).toHaveBeenCalledTimes(1);
		});
	});
});
