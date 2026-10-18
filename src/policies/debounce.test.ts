import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createHarness,
	deferred,
	noPayload,
	type TestEvents,
} from "../test-helpers";
import type { Task } from "../types";
import { debounce } from "./debounce";

const deb = <P, R>(ms: number, fn: Task<P, TestEvents, R>) => debounce(ms, fn);

describe("debounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("timing", () => {
		it("does not run before the quiet period ends", async () => {
			const h = createHarness();
			const fn = vi.fn();
			deb(100, fn)(1, h.ctx());
			await vi.advanceTimersByTimeAsync(99);

			expect(fn).not.toHaveBeenCalled();
		});

		it("runs once the quiet period ends", async () => {
			const h = createHarness();
			const fn = vi.fn();
			deb(100, fn)(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(fn).toHaveBeenCalledTimes(1);
			expect(fn.mock.calls[0]?.[0]).toBe(1);
		});

		it("restarts the wait on every new call", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = deb(100, fn);
			d(1, h.ctx());
			await vi.advanceTimersByTimeAsync(99);
			d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(99);
			expect(fn).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);

			expect(fn).toHaveBeenCalledTimes(1);
			expect(fn.mock.calls[0]?.[0]).toBe(2);
		});

		it("runs only the last of many rapid calls", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = deb(100, fn);
			for (let i = 1; i <= 50; i++) {
				d(i, h.ctx());
				await vi.advanceTimersByTimeAsync(10);
			}
			await vi.advanceTimersByTimeAsync(100);

			expect(fn).toHaveBeenCalledTimes(1);
			expect(fn.mock.calls[0]?.[0]).toBe(50);
		});

		it("starts a new wait for a call after the previous one ran", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = deb(100, fn);
			d(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);
			d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2]);
		});

		it("works with a zero delay", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = deb(0, fn);
			d(1, h.ctx());
			d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(0);

			expect(fn).toHaveBeenCalledTimes(1);
			expect(fn.mock.calls[0]?.[0]).toBe(2);
		});

		it("works with a void payload", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = deb(100, fn);
			d(noPayload, h.ctx());
			d(noPayload, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("keeps separate instances independent", async () => {
			const h = createHarness();
			const a = vi.fn();
			const b = vi.fn();
			deb(100, a)(1, h.ctx());
			deb(100, b)(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(a).toHaveBeenCalledTimes(1);
			expect(b).toHaveBeenCalledTimes(1);
		});

		it("leaves no timers behind once settled", async () => {
			const h = createHarness();
			const d = deb(100, () => 1);
			d(1, h.ctx());
			d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("results", () => {
		it("resolves with the result of the last call", async () => {
			const h = createHarness();
			const promise = deb(100, (n: number) => n * 2)(4, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(promise).resolves.toBe(8);
		});

		it("resolves a replaced call with undefined", async () => {
			const h = createHarness();
			const d = deb(100, (n: number) => n);
			const first = d(1, h.ctx());
			const second = d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe(2);
		});

		it("awaits an async fn", async () => {
			const h = createHarness();
			const promise = deb(100, async (n: number) => n + 1)(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(promise).resolves.toBe(2);
		});
	});

	describe("errors", () => {
		it("rejects with a sync error of fn", async () => {
			const h = createHarness();
			const promise = deb(100, () => {
				throw new Error("boom");
			})(1, h.ctx());
			const assertion = expect(promise).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		});

		it("rejects with an async error of fn", async () => {
			const h = createHarness();
			const promise = deb(100, async () => {
				throw new Error("boom");
			})(1, h.ctx());
			const assertion = expect(promise).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		});

		it("works again after an error", async () => {
			const h = createHarness();
			const d = deb(100, (n: number) => {
				if (n === 1) {
					throw new Error("boom");
				}
				return n;
			});
			const failing = d(1, h.ctx());
			const assertion = expect(failing).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(100);
			await assertion;
			const ok = d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(ok).resolves.toBe(2);
		});
	});

	describe("abort", () => {
		it("does not run when the task is already aborted", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort();
			const fn = vi.fn();

			expect(deb(100, fn)(1, ctx)).toBeUndefined();
			await vi.advanceTimersByTimeAsync(100);
			expect(fn).not.toHaveBeenCalled();
		});

		it("does not run when the task is aborted during the wait", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const fn = vi.fn();
			const promise = deb(100, fn)(1, ctx);
			await vi.advanceTimersByTimeAsync(50);
			ctx.abort();
			await vi.advanceTimersByTimeAsync(100);

			await expect(promise).resolves.toBeUndefined();
			expect(fn).not.toHaveBeenCalled();
		});

		it("clears the timer when the task is aborted during the wait", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			deb(100, () => 1)(1, ctx);
			ctx.abort();

			expect(vi.getTimerCount()).toBe(0);
		});

		it("aborts a running fn when a new call arrives", async () => {
			const h = createHarness();
			const d = deferred();
			const signals: AbortSignal[] = [];
			const db = deb(100, (_: number, c) => {
				signals.push(c.signal);
				return d.promise;
			});
			db(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);
			expect(signals[0]?.aborted).toBe(false);
			db(2, h.ctx());

			expect(signals[0]?.aborted).toBe(true);
			d.resolve();
		});

		it("drops the result of a run that was superseded in flight", async () => {
			const h = createHarness();
			const d = deferred<string>();
			const db = deb(100, (n: number) => (n === 1 ? d.promise : "second"));
			const first = db(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);
			db(2, h.ctx());
			d.resolve("first");
			await vi.advanceTimersByTimeAsync(100);

			await expect(first).resolves.toBeUndefined();
		});

		it("aborts a running fn when the task aborts", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const signals: AbortSignal[] = [];
			deb(100, (_: number, c) => {
				signals.push(c.signal);
				return new Promise(() => {});
			})(1, ctx);
			await vi.advanceTimersByTimeAsync(100);
			ctx.abort("gone");

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[0]?.reason).toBe("gone");
		});

		it("a self-abort inside fn does not block later calls (saga #2313)", async () => {
			const h = createHarness();
			const fn = vi.fn((_: number, c: { abort: () => void }) => c.abort());
			h.bus.on("t", deb(100, fn));
			h.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(100);
			h.bus.emit("t", 2);
			await vi.advanceTimersByTimeAsync(100);

			expect(fn).toHaveBeenCalledTimes(2);
		});
	});

	describe("trace", () => {
		it("start and done for a call that ran", async () => {
			const h = createHarness();
			deb(100, () => 1)(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(h.phases()).toEqual(["debounce/start", "debounce/done"]);
		});

		it("reports nothing before the wait ends", async () => {
			const h = createHarness();
			deb(100, () => 1)(1, h.ctx());
			await vi.advanceTimersByTimeAsync(50);

			expect(h.phases()).toEqual([]);
		});

		it("drops a replaced call that never started", async () => {
			const h = createHarness();
			const d = deb(100, () => 1);
			d(1, h.ctx());
			d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(h.phases()).toEqual([
				"debounce/drop",
				"debounce/start",
				"debounce/done",
			]);
		});

		it("cancels (not drops) a call replaced after it started", async () => {
			const h = createHarness();
			const db = deb(100, () => new Promise(() => {}));
			db(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);
			db(2, h.ctx());

			expect(h.phases()).toEqual(["debounce/start", "debounce/cancel"]);
		});

		it("drops every call but the last in a burst", async () => {
			const h = createHarness();
			const d = deb(100, () => 1);
			for (let i = 0; i < 5; i++) {
				d(i, h.ctx());
			}
			await vi.advanceTimersByTimeAsync(100);
			const phases = h.phases();

			expect(phases.filter((p) => p === "debounce/drop")).toHaveLength(4);
			expect(phases.filter((p) => p === "debounce/start")).toHaveLength(1);
			expect(phases.filter((p) => p === "debounce/done")).toHaveLength(1);
		});

		it("drops a call whose task was aborted during the wait", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			deb(100, () => 1)(1, ctx);
			ctx.abort();

			expect(h.phases()).toEqual(["debounce/drop"]);
		});

		it("reports an error", async () => {
			const h = createHarness();
			const promise = deb(100, () => {
				throw new Error("boom");
			})(1, h.ctx());
			const assertion = expect(promise).rejects.toThrow();
			await vi.advanceTimersByTimeAsync(100);
			await assertion;

			expect(h.phases()).toEqual(["debounce/start", "debounce/error"]);
		});
	});

	describe("on a bus", () => {
		it("runs the last emit of a burst", async () => {
			const h = createHarness();
			const fn = vi.fn();
			h.bus.on("t", deb(100, fn));
			h.bus.emit("t", 1);
			h.bus.emit("t", 2);
			h.bus.emit("t", 3);
			await vi.advanceTimersByTimeAsync(100);

			expect(fn).toHaveBeenCalledTimes(1);
			expect(fn.mock.calls[0]?.[0]).toBe(3);
		});
	});

	describe("leading and trailing options", () => {
		const opt = <P, R>(
			fn: Task<P, TestEvents, R>,
			options: Parameters<typeof debounce>[2],
		) => debounce(100, fn, options);

		it("leading runs the first call of a burst at once", () => {
			const h = createHarness();
			const fn = vi.fn();
			opt(fn, { leading: true })(1, h.ctx());

			expect(fn).toHaveBeenCalledTimes(1);
			expect(fn.mock.calls[0]?.[0]).toBe(1);
		});

		it("leading alone runs a single call once, with no trailing repeat", async () => {
			const h = createHarness();
			const fn = vi.fn();
			opt(fn, { leading: true })(1, h.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("leading and trailing: the rest of the burst runs once, with the last payload", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = opt(fn, { leading: true });
			d(1, h.ctx());
			d(2, h.ctx());
			d(3, h.ctx());
			expect(fn).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(100);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 3]);
		});

		it("leading and trailing: a call after the quiet period leads again", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = opt(fn, { leading: true });
			d(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);
			d(2, h.ctx());

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2]);
		});

		it("leading, trailing: false runs only the first call of a burst", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = opt(fn, { leading: true, trailing: false });
			d(1, h.ctx());
			d(2, h.ctx());
			d(3, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1]);
		});

		it("leading, trailing: false: each call extends the burst", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = opt(fn, { leading: true, trailing: false });
			d(1, h.ctx());
			await vi.advanceTimersByTimeAsync(60);
			d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(60);
			d(3, h.ctx());
			await vi.advanceTimersByTimeAsync(100);
			d(4, h.ctx());

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 4]);
		});

		it("both false: nothing runs", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = opt(fn, { trailing: false });
			d(1, h.ctx());
			d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(fn).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("the leading call returns the result of fn", async () => {
			const h = createHarness();
			const d = opt(async (n: number) => n * 2, { leading: true });

			await expect(d(4, h.ctx())).resolves.toBe(8);
		});

		it("a leading error rejects that call, and the burst goes on", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => {
				if (n === 1) {
					throw new Error("boom");
				}
				return n;
			});
			const d = opt(fn, { leading: true });

			expect(() => d(1, h.ctx())).toThrow("boom");
			const last = d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(last).resolves.toBe(2);
		});

		it("the leading call runs on the task's own context and is not aborted by later calls", () => {
			const h = createHarness();
			const ctx = h.ctx();
			const signals: AbortSignal[] = [];
			const d = opt(
				(_: number, c) => {
					signals.push(c.signal);
					return new Promise(() => {});
				},
				{ leading: true },
			);
			d(1, ctx);
			d(2, h.ctx());

			expect(signals[0]).toBe(ctx.signal);
			expect(signals[0]?.aborted).toBe(false);
		});

		it("a burst whose waiting call is aborted ends, so the next call leads", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const fn = vi.fn();
			const d = opt(fn, { leading: true });
			d(1, ctx);
			ctx.abort();
			d(2, h.ctx());

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2]);
		});

		it("a superseded wait does not end the burst", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const d = opt(fn, { leading: true });
			d(1, h.ctx());
			d(2, h.ctx());
			d(3, h.ctx());

			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("traces the leading run as start, done and the first wait as a drop", async () => {
			const h = createHarness();
			opt(() => 1, { leading: true })(1, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(h.phases()).toEqual([
				"debounce/start",
				"debounce/done",
				"debounce/drop",
			]);
		});

		it("traces the trailing run after the leading one", async () => {
			const h = createHarness();
			const d = opt(() => 1, { leading: true });
			d(1, h.ctx());
			d(2, h.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(h.phases()).toEqual([
				"debounce/start",
				"debounce/done",
				"debounce/drop",
				"debounce/start",
				"debounce/done",
			]);
		});

		it("ignores a call whose task is already aborted", () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort();
			const fn = vi.fn();

			expect(opt(fn, { leading: true })(1, ctx)).toBeUndefined();
			expect(fn).not.toHaveBeenCalled();
		});
	});
});
