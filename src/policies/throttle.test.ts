import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	noPayload,
	type TestEvents,
} from "../tests/test-helpers";
import { type ThrottleOptions, throttle } from "./throttle";

const throttleTask = <P, R>(ms: number, handler: Task<P, TestEvents, R>) =>
	throttle(ms, handler);

describe("throttle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("window", () => {
		it("runs the first call at once", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(100, handler);

			expect(throttled(1, harness.ctx())).toBe(1);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("holds calls made inside the window until it closes", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(99);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("runs only the latest of the held calls", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			throttled(3, harness.ctx());
			throttled(4, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 4]);
		});

		it("does not fire a trailing run after a single call (no double trigger)", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("runs a call made right after the window closed at once", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(throttled(2, harness.ctx())).toBe(2);
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("a call right after a quiet window runs at once, even just after a trailing run (as in lodash)", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);

			expect(throttled(3, harness.ctx())).toBe(3);
			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
		});

		it("a call that follows recent activity waits for the end of its window", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(50);
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(60); // trailing run of 2 at t=100
			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);
			throttled(3, harness.ctx()); // t=110: the last call was 60 ms ago, the last run 10 ms ago
			await vi.advanceTimersByTimeAsync(99);
			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);
			await vi.advanceTimersByTimeAsync(1);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
		});

		it("runs at most once per window under a steady stream", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const throttled = throttleTask(100, handler);
			for (let index = 0; index < 100; index++) {
				throttled(index, harness.ctx());
				await vi.advanceTimersByTimeAsync(10);
			}
			await vi.advanceTimersByTimeAsync(200);

			expect(handler.mock.calls.length).toBeLessThanOrEqual(11);
			expect(handler.mock.calls.length).toBeGreaterThanOrEqual(9);
		});

		it("works with a zero window", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(0, handler);
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(0);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);
		});

		it("works with a void payload", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const throttled = throttleTask(100, handler);
			throttled(noPayload, harness.ctx());
			throttled(noPayload, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("measures the window from the call, not from the end of an async fn", async () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn(() => gate.promise);
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			throttled(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
			gate.resolve();
		});

		it("keeps separate instances independent", () => {
			const harness = createHarness();
			const first = vi.fn();
			const second = vi.fn();
			throttleTask(100, first)(1, harness.ctx());
			throttleTask(100, second)(1, harness.ctx());

			expect(first).toHaveBeenCalledTimes(1);
			expect(second).toHaveBeenCalledTimes(1);
		});
	});

	describe("results", () => {
		it("returns the result of an immediate run", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, async (value: number) => value * 2);

			await expect(throttled(2, harness.ctx())).resolves.toBe(4);
		});

		it("resolves a held call with its result", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, (value: number) => value * 2);
			throttled(1, harness.ctx());
			const held = throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBe(4);
		});

		it("flattens an async result of a held call", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, async (value: number) => value * 2);
			throttled(1, harness.ctx());
			const held = throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBe(4);
		});

		it("resolves a replaced held call with undefined", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, (value: number) => value);
			throttled(1, harness.ctx());
			const second = throttled(2, harness.ctx());
			const third = throttled(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(second).resolves.toBeUndefined();
			await expect(third).resolves.toBe(3);
		});
	});

	describe("errors", () => {
		it("rethrows a sync error of an immediate run", () => {
			const harness = createHarness();
			const throttled = throttleTask(100, () => {
				throw new Error("boom");
			});

			expect(() => throttled(1, harness.ctx())).toThrow("boom");
		});

		it("rejects a held call whose run throws", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, (value: number) => {
				if (value === 2) {
					throw new Error("boom");
				}
			});
			throttled(1, harness.ctx());
			const held = throttled(2, harness.ctx());
			const assertion = expect(held).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		});

		it("rejects with an async error of an immediate run", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, async () => {
				throw new Error("boom");
			});

			await expect(throttled(1, harness.ctx())).rejects.toThrow("boom");
		});

		it("keeps throttling after an error", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => {
				if (value === 1) {
					throw new Error("boom");
				}
				return value;
			});
			const throttled = throttleTask(100, handler);
			expect(() => throttled(1, harness.ctx())).toThrow();
			const held = throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBe(2);
		});
	});

	describe("abort", () => {
		it("ignores a call whose task is already aborted", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			const handler = vi.fn();

			expect(throttleTask(100, handler)(1, ctx)).toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
			expect(harness.phases()).toEqual([]);
		});

		it("does not open a window for an ignored aborted call", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(100, handler);
			throttled(1, ctx);

			expect(throttled(2, harness.ctx())).toBe(2);
		});

		it("skips a held call whose task was aborted before the window closed", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			const heldCtx = harness.ctx();
			const held = throttled(2, heldCtx);
			heldCtx.abort();
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("the window still closes after a skipped aborted held call", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			const heldCtx = harness.ctx();
			throttled(2, heldCtx);
			heldCtx.abort();
			await vi.advanceTimersByTimeAsync(100);

			expect(throttled(3, harness.ctx())).toBe(3);
		});

		it("passes the original task context to fn", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const signals: AbortSignal[] = [];
			throttleTask(100, (_: number, ctx) => {
				signals.push(ctx.signal);
			})(1, ctx);

			expect(signals[0]).toBe(ctx.signal);
		});

		it("passes the held task context to the trailing run", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const throttled = throttleTask(100, (_: number, ctx) => {
				signals.push(ctx.signal);
			});
			throttled(1, harness.ctx());
			const heldCtx = harness.ctx();
			throttled(2, heldCtx);
			await vi.advanceTimersByTimeAsync(100);

			expect(signals[1]).toBe(heldCtx.signal);
		});
	});

	describe("trace", () => {
		it("start and done for an immediate run", () => {
			const harness = createHarness();
			throttleTask(100, () => 1)(1, harness.ctx());

			expect(harness.phases()).toEqual(["throttle/start", "throttle/done"]);
		});

		it("drops a replaced held call, runs the last one", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, () => 1);
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			throttled(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(harness.phases()).toEqual([
				"throttle/start",
				"throttle/done",
				"throttle/drop",
				"throttle/start",
				"throttle/done",
			]);
		});

		it("drops a held call aborted before the window closed", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, () => 1);
			throttled(1, harness.ctx());
			const heldCtx = harness.ctx();
			throttled(2, heldCtx);
			heldCtx.abort();
			await vi.advanceTimersByTimeAsync(100);

			expect(harness.phases()).toEqual([
				"throttle/start",
				"throttle/done",
				"throttle/drop",
			]);
		});

		it("reports an error", () => {
			const harness = createHarness();
			try {
				throttleTask(100, () => {
					throw new Error("boom");
				})(1, harness.ctx());
			} catch {}

			expect(harness.phases()).toEqual(["throttle/start", "throttle/error"]);
		});

		it("reports cancel when the task is aborted while fn runs", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const gate = deferred();
			const promise = throttleTask(100, () => gate.promise)(1, ctx);
			ctx.abort();
			gate.resolve();
			await promise;

			expect(harness.phases()).toEqual(["throttle/start", "throttle/cancel"]);
		});
	});

	describe("on a bus", () => {
		it("runs the first and the last of a burst", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("t", throttleTask(100, handler));
			harness.bus.emit("t", 1);
			harness.bus.emit("t", 2);
			harness.bus.emit("t", 3);
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 3]);
		});
	});

	describe("leading and trailing options", () => {
		const throttleWith = <P, R>(
			handler: Task<P, TestEvents, R>,
			options: ThrottleOptions<P>,
		) => throttle(100, handler, options);

		it("trailing: false drops the calls made during a window", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleWith(handler, { trailing: false });
			throttled(1, harness.ctx());
			const dropped = throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(dropped).toBeUndefined();
			expect(handler.mock.calls.map((call) => call[0])).toEqual([1]);
		});

		it("trailing: false runs the next call after the window at once", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleWith(handler, { trailing: false });
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(throttled(3, harness.ctx())).toBe(3);
		});

		it("trailing: false reports the dropped calls", () => {
			const harness = createHarness();
			const throttled = throttleWith(() => 1, { trailing: false });
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			throttled(3, harness.ctx());

			expect(harness.phases()).toEqual([
				"throttle/start",
				"throttle/done",
				"throttle/drop",
				"throttle/drop",
			]);
		});

		it("leading: false holds even the first call until its window ends", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleWith(handler, { leading: false });
			const first = throttled(1, harness.ctx());
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(99);
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1]);
			await expect(first).resolves.toBe(1);
		});

		it("leading: false runs only the latest call of the window", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleWith(handler, { leading: false });
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			throttled(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([3]);
		});

		it("leading: false does not run anything for a window with no calls", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const throttled = throttleWith(handler, { leading: false });
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).not.toHaveBeenCalled();
			throttled(1, harness.ctx());
			expect(handler).not.toHaveBeenCalled();
		});

		it("leading: false resolves a replaced call with undefined and traces the drop", async () => {
			const harness = createHarness();
			const throttled = throttleWith((value: number) => value, {
				leading: false,
			});
			const first = throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(first).resolves.toBeUndefined();
			expect(harness.phases()).toEqual([
				"throttle/drop",
				"throttle/start",
				"throttle/done",
			]);
		});

		it("leading: false skips a held call whose task aborted", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const ctx = harness.ctx();
			const throttled = throttleWith(handler, { leading: false });
			const held = throttled(1, ctx);
			ctx.abort();
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});

		it("both false: nothing ever runs, and no timer outlives the window", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const throttled = throttleWith(handler, {
				leading: false,
				trailing: false,
			});
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("the default is leading and trailing", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const throttled = throttleWith(handler, {});
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);
		});
	});
});
