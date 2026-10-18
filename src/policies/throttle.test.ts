import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createHarness,
	deferred,
	noPayload,
	type TestEvents,
} from "../test-helpers";
import type { Task } from "../types";
import { throttle } from "./throttle";

const thr = <P, R>(ms: number, fn: Task<P, TestEvents, R>) => throttle(ms, fn);

describe("throttle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("window", () => {
		it("runs the first call at once", () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);
			const t = thr(100, fn);

			expect(t(1, h.ctx())).toBe(1);
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("holds calls made inside the window until it closes", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);
			const t = thr(100, fn);
			t(1, h.ctx());
			t(2, h.ctx());
			expect(fn).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(99);
			expect(fn).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);

			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("runs only the latest of the held calls", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);
			const t = thr(100, fn);
			t(1, h.ctx());
			t(2, h.ctx());
			t(3, h.ctx());
			t(4, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 4]);
		});

		it("does not fire a trailing run after a single call (no double trigger)", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const t = thr(100, fn);
			t(1, h.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("runs a call made right after the window closed at once", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);
			const t = thr(100, fn);
			t(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(t(2, h.ctx())).toBe(2);
			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("a trailing run opens a new window", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);
			const t = thr(100, fn);
			t(1, h.ctx());
			t(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);
			expect(fn).toHaveBeenCalledTimes(2);
			t(3, h.ctx());
			expect(fn).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(99);
			expect(fn).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(1);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
		});

		it("runs at most once per window under a steady stream", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const t = thr(100, fn);
			for (let i = 0; i < 100; i++) {
				t(i, h.ctx());
				await vi.advanceTimersByTimeAsync(10);
			}
			await vi.advanceTimersByTimeAsync(200);

			expect(fn.mock.calls.length).toBeLessThanOrEqual(11);
			expect(fn.mock.calls.length).toBeGreaterThanOrEqual(9);
		});

		it("works with a zero window", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);
			const t = thr(0, fn);
			t(1, h.ctx());
			t(2, h.ctx());
			await vi.advanceTimersByTimeAsync(0);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2]);
		});

		it("works with a void payload", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const t = thr(100, fn);
			t(noPayload, h.ctx());
			t(noPayload, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("measures the window from the call, not from the end of an async fn", async () => {
			const h = createHarness();
			const d = deferred();
			const fn = vi.fn(() => d.promise);
			const t = thr(100, fn);
			t(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);
			t(2, h.ctx());

			expect(fn).toHaveBeenCalledTimes(2);
			d.resolve();
		});

		it("keeps separate instances independent", () => {
			const h = createHarness();
			const a = vi.fn();
			const b = vi.fn();
			thr(100, a)(1, h.ctx());
			thr(100, b)(1, h.ctx());

			expect(a).toHaveBeenCalledTimes(1);
			expect(b).toHaveBeenCalledTimes(1);
		});
	});

	describe("results", () => {
		it("returns the result of an immediate run", async () => {
			const h = createHarness();
			const t = thr(100, async (n: number) => n * 2);

			await expect(t(2, h.ctx())).resolves.toBe(4);
		});

		it("resolves a held call with its result", async () => {
			const h = createHarness();
			const t = thr(100, (n: number) => n * 2);
			t(1, h.ctx());
			const held = t(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBe(4);
		});

		it("flattens an async result of a held call", async () => {
			const h = createHarness();
			const t = thr(100, async (n: number) => n * 2);
			t(1, h.ctx());
			const held = t(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBe(4);
		});

		it("resolves a replaced held call with undefined", async () => {
			const h = createHarness();
			const t = thr(100, (n: number) => n);
			t(1, h.ctx());
			const second = t(2, h.ctx());
			const third = t(3, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(second).resolves.toBeUndefined();
			await expect(third).resolves.toBe(3);
		});
	});

	describe("errors", () => {
		it("rethrows a sync error of an immediate run", () => {
			const h = createHarness();
			const t = thr(100, () => {
				throw new Error("boom");
			});

			expect(() => t(1, h.ctx())).toThrow("boom");
		});

		it("rejects a held call whose run throws", async () => {
			const h = createHarness();
			const t = thr(100, (n: number) => {
				if (n === 2) {
					throw new Error("boom");
				}
			});
			t(1, h.ctx());
			const held = t(2, h.ctx());
			const assertion = expect(held).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		});

		it("rejects with an async error of an immediate run", async () => {
			const h = createHarness();
			const t = thr(100, async () => {
				throw new Error("boom");
			});

			await expect(t(1, h.ctx())).rejects.toThrow("boom");
		});

		it("keeps throttling after an error", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => {
				if (n === 1) {
					throw new Error("boom");
				}
				return n;
			});
			const t = thr(100, fn);
			expect(() => t(1, h.ctx())).toThrow();
			const held = t(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBe(2);
		});
	});

	describe("abort", () => {
		it("ignores a call whose task is already aborted", () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort();
			const fn = vi.fn();

			expect(thr(100, fn)(1, ctx)).toBeUndefined();
			expect(fn).not.toHaveBeenCalled();
			expect(h.phases()).toEqual([]);
		});

		it("does not open a window for an ignored aborted call", () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort();
			const fn = vi.fn((n: number) => n);
			const t = thr(100, fn);
			t(1, ctx);

			expect(t(2, h.ctx())).toBe(2);
		});

		it("skips a held call whose task was aborted before the window closed", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);
			const t = thr(100, fn);
			t(1, h.ctx());
			const heldCtx = h.ctx();
			const held = t(2, heldCtx);
			heldCtx.abort();
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBeUndefined();
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("the window still closes after a skipped aborted held call", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);
			const t = thr(100, fn);
			t(1, h.ctx());
			const heldCtx = h.ctx();
			t(2, heldCtx);
			heldCtx.abort();
			await vi.advanceTimersByTimeAsync(100);

			expect(t(3, h.ctx())).toBe(3);
		});

		it("passes the original task context to fn", () => {
			const h = createHarness();
			const ctx = h.ctx();
			const signals: AbortSignal[] = [];
			thr(100, (_: number, c) => {
				signals.push(c.signal);
			})(1, ctx);

			expect(signals[0]).toBe(ctx.signal);
		});

		it("passes the held task context to the trailing run", async () => {
			const h = createHarness();
			const signals: AbortSignal[] = [];
			const t = thr(100, (_: number, c) => {
				signals.push(c.signal);
			});
			t(1, h.ctx());
			const heldCtx = h.ctx();
			t(2, heldCtx);
			await vi.advanceTimersByTimeAsync(100);

			expect(signals[1]).toBe(heldCtx.signal);
		});
	});

	describe("trace", () => {
		it("start and done for an immediate run", () => {
			const h = createHarness();
			thr(100, () => 1)(1, h.ctx());

			expect(h.phases()).toEqual(["throttle/start", "throttle/done"]);
		});

		it("drops a replaced held call, runs the last one", async () => {
			const h = createHarness();
			const t = thr(100, () => 1);
			t(1, h.ctx());
			t(2, h.ctx());
			t(3, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(h.phases()).toEqual([
				"throttle/start",
				"throttle/done",
				"throttle/drop",
				"throttle/start",
				"throttle/done",
			]);
		});

		it("drops a held call aborted before the window closed", async () => {
			const h = createHarness();
			const t = thr(100, () => 1);
			t(1, h.ctx());
			const heldCtx = h.ctx();
			t(2, heldCtx);
			heldCtx.abort();
			await vi.advanceTimersByTimeAsync(100);

			expect(h.phases()).toEqual([
				"throttle/start",
				"throttle/done",
				"throttle/drop",
			]);
		});

		it("reports an error", () => {
			const h = createHarness();
			try {
				thr(100, () => {
					throw new Error("boom");
				})(1, h.ctx());
			} catch {}

			expect(h.phases()).toEqual(["throttle/start", "throttle/error"]);
		});

		it("reports cancel when the task is aborted while fn runs", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const d = deferred();
			const promise = thr(100, () => d.promise)(1, ctx);
			ctx.abort();
			d.resolve();
			await promise;

			expect(h.phases()).toEqual(["throttle/start", "throttle/cancel"]);
		});
	});

	describe("on a bus", () => {
		it("runs the first and the last of a burst", async () => {
			const h = createHarness();
			const fn = vi.fn();
			h.bus.on("t", thr(100, fn));
			h.bus.emit("t", 1);
			h.bus.emit("t", 2);
			h.bus.emit("t", 3);
			await vi.advanceTimersByTimeAsync(100);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 3]);
		});
	});
});
