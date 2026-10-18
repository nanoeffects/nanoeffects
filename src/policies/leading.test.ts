import { describe, expect, it, vi } from "vitest";
import { createHarness, deferred, type TestEvents } from "../test-helpers";
import type { Task } from "../types";
import { leading } from "./leading";

const lead = <P, R>(fn: Task<P, TestEvents, R>) => leading(fn);

describe("leading", () => {
	describe("locking", () => {
		it("runs the first call", () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);

			expect(lead(fn)(1, h.ctx())).toBe(1);
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("drops calls while an async run is in flight", () => {
			const h = createHarness();
			const d = deferred();
			const fn = vi.fn(() => d.promise);
			const l = lead(fn);
			l(1, h.ctx());

			expect(l(2, h.ctx())).toBeUndefined();
			expect(l(3, h.ctx())).toBeUndefined();
			expect(fn).toHaveBeenCalledTimes(1);
			d.resolve();
		});

		it("accepts calls again once the run resolved", async () => {
			const h = createHarness();
			const d = deferred();
			const fn = vi.fn((n: number) => (n === 1 ? d.promise : n));
			const l = lead(fn);
			const first = l(1, h.ctx());
			d.resolve();
			await first;

			expect(l(2, h.ctx())).toBe(2);
			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("never locks on a sync fn", () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => n);
			const l = lead(fn);
			l(1, h.ctx());
			l(2, h.ctx());
			l(3, h.ctx());

			expect(fn).toHaveBeenCalledTimes(3);
		});

		it("accepts calls again after a rejection", async () => {
			const h = createHarness();
			const fn = vi.fn(async (n: number) => {
				if (n === 1) {
					throw new Error("boom");
				}
				return n;
			});
			const l = lead(fn);
			await Promise.resolve(l(1, h.ctx())).catch(() => {});

			await expect(l(2, h.ctx())).resolves.toBe(2);
		});

		it("accepts calls again after a sync error", () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => {
				if (n === 1) {
					throw new Error("boom");
				}
				return n;
			});
			const l = lead(fn);
			expect(() => l(1, h.ctx())).toThrow("boom");

			expect(l(2, h.ctx())).toBe(2);
		});

		it("keeps locking calls made after a long-running run started", async () => {
			const h = createHarness();
			const d = deferred();
			const fn = vi.fn(() => d.promise);
			const l = lead(fn);
			l(1, h.ctx());
			for (let i = 0; i < 20; i++) {
				l(i, h.ctx());
			}
			d.resolve();
			await Promise.resolve();

			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("keeps separate instances independent", () => {
			const h = createHarness();
			const d = deferred();
			const a = lead(() => d.promise);
			const b = vi.fn();
			a(1, h.ctx());
			lead(b)(1, h.ctx());

			expect(b).toHaveBeenCalledTimes(1);
			d.resolve();
		});

		it("resolves with the result of the run", async () => {
			const h = createHarness();

			await expect(lead(async (n: number) => n * 3)(2, h.ctx())).resolves.toBe(
				6,
			);
		});

		it("a dropped call does not abort its own task", () => {
			const h = createHarness();
			const d = deferred();
			const l = lead(() => d.promise);
			l(1, h.ctx());
			const droppedCtx = h.ctx();
			l(2, droppedCtx);

			expect(droppedCtx.signal.aborted).toBe(false);
			d.resolve();
		});
	});

	describe("abort", () => {
		it("gives fn the original task context", () => {
			const h = createHarness();
			const ctx = h.ctx();
			const signals: AbortSignal[] = [];
			lead((_: number, c) => {
				signals.push(c.signal);
			})(1, ctx);

			expect(signals[0]).toBe(ctx.signal);
		});

		it("aborting the task aborts the running fn", () => {
			const h = createHarness();
			const ctx = h.ctx();
			const signals: AbortSignal[] = [];
			lead((_: number, c) => {
				signals.push(c.signal);
				return new Promise(() => {});
			})(1, ctx);
			ctx.abort();

			expect(signals[0]?.aborted).toBe(true);
		});

		it("releases the lock when the running task is aborted, even if fn still runs", () => {
			const h = createHarness();
			const ctx = h.ctx();
			const fn = vi.fn(() => new Promise(() => {}));
			const l = lead(fn);
			l(1, ctx);
			ctx.abort();
			l(2, h.ctx());

			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("an aborted run settling late does not release the lock of a newer run", async () => {
			const h = createHarness();
			const first = h.ctx();
			const d1 = deferred();
			const d2 = deferred();
			const fn = vi.fn((n: number) => (n === 1 ? d1.promise : d2.promise));
			const l = lead(fn);
			l(1, first);
			first.abort();
			l(2, h.ctx());
			d1.resolve();
			await Promise.resolve();
			await Promise.resolve();
			l(3, h.ctx());

			expect(fn).toHaveBeenCalledTimes(2);
			d2.resolve();
		});

		it("aborting the task of a dropped call does not release the lock", () => {
			const h = createHarness();
			const fn = vi.fn(() => new Promise(() => {}));
			const l = lead(fn);
			l(1, h.ctx());
			const droppedCtx = h.ctx();
			l(2, droppedCtx);
			droppedCtx.abort();
			l(3, h.ctx());

			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("aborting a task after its run finished changes nothing", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const fn = vi.fn((n: number) => n);
			const l = lead(fn);
			l(1, ctx);
			ctx.abort();

			expect(l(2, h.ctx())).toBe(2);
			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("a self-abort inside fn releases the lock (saga #2313)", async () => {
			const h = createHarness();
			const fn = vi.fn(async (_: number, c: { abort: () => void }) => {
				c.abort();
			});
			h.bus.on("t", lead(fn));
			h.bus.emit("t", 1);
			await Promise.resolve();
			await Promise.resolve();
			h.bus.emit("t", 2);

			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("ignores a call whose task is already aborted", () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort();
			const fn = vi.fn();

			expect(lead(fn)(1, ctx)).toBeUndefined();
			expect(fn).not.toHaveBeenCalled();
			expect(h.phases()).toEqual([]);
		});

		it("an ignored aborted call does not take the lock", () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort();
			const fn = vi.fn((n: number) => n);
			const l = lead(fn);
			l(1, ctx);

			expect(l(2, h.ctx())).toBe(2);
		});
	});

	describe("trace", () => {
		it("start and done", async () => {
			const h = createHarness();
			await lead(async () => {})(1, h.ctx());

			expect(h.phases()).toEqual(["leading/start", "leading/done"]);
		});

		it("reports a dropped call", () => {
			const h = createHarness();
			const l = lead(() => new Promise(() => {}));
			l(1, h.ctx());
			l(2, h.ctx());

			expect(h.phases()).toEqual(["leading/start", "leading/drop"]);
		});

		it("reports start, drop, done in order", async () => {
			const h = createHarness();
			const d = deferred();
			const l = lead(() => d.promise);
			const first = l(1, h.ctx());
			l(2, h.ctx());
			d.resolve();
			await first;

			expect(h.phases()).toEqual([
				"leading/start",
				"leading/drop",
				"leading/done",
			]);
		});

		it("reports an async error", async () => {
			const h = createHarness();
			await Promise.resolve(
				lead(async () => {
					throw new Error("boom");
				})(1, h.ctx()),
			).catch(() => {});

			expect(h.phases()).toEqual(["leading/start", "leading/error"]);
		});

		it("reports a sync error", () => {
			const h = createHarness();
			try {
				lead(() => {
					throw new Error("boom");
				})(1, h.ctx());
			} catch {}

			expect(h.phases()).toEqual(["leading/start", "leading/error"]);
		});

		it("reports cancel when the task aborts mid-run", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const d = deferred();
			const promise = lead(() => d.promise)(1, ctx);
			ctx.abort();
			d.resolve();
			await promise;

			expect(h.phases()).toEqual(["leading/start", "leading/cancel"]);
		});
	});

	describe("on a bus", () => {
		it("runs once for a burst while the first is in flight", () => {
			const h = createHarness();
			const d = deferred();
			const fn = vi.fn(() => d.promise);
			h.bus.on("t", lead(fn));
			h.bus.emit("t", 1);
			h.bus.emit("t", 2);
			h.bus.emit("t", 3);

			expect(fn).toHaveBeenCalledTimes(1);
			d.resolve();
		});
	});
});
