import { describe, expect, it, vi } from "vitest";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { leading } from "./leading";

const leadingTask = <P, R>(handler: Task<P, TestEvents, R>) => leading(handler);

describe("leading", () => {
	describe("locking", () => {
		it("runs the first call", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);

			expect(leadingTask(handler)(1, harness.ctx())).toBe(1);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("drops calls while an async run is in flight", () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn(() => gate.promise);
			const leading = leadingTask(handler);
			leading(1, harness.ctx());

			expect(leading(2, harness.ctx())).toBeUndefined();
			expect(leading(3, harness.ctx())).toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
			gate.resolve();
		});

		it("accepts calls again once the run resolved", async () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn((value: number) =>
				value === 1 ? gate.promise : value,
			);
			const leading = leadingTask(handler);
			const first = leading(1, harness.ctx());
			gate.resolve();
			await first;

			expect(leading(2, harness.ctx())).toBe(2);
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("never locks on a sync fn", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const leading = leadingTask(handler);
			leading(1, harness.ctx());
			leading(2, harness.ctx());
			leading(3, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(3);
		});

		it("accepts calls again after a rejection", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => {
				if (value === 1) {
					throw new Error("boom");
				}
				return value;
			});
			const leading = leadingTask(handler);
			await Promise.resolve(leading(1, harness.ctx())).catch(() => {});

			await expect(leading(2, harness.ctx())).resolves.toBe(2);
		});

		it("accepts calls again after a sync error", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => {
				if (value === 1) {
					throw new Error("boom");
				}
				return value;
			});
			const leading = leadingTask(handler);
			expect(() => leading(1, harness.ctx())).toThrow("boom");

			expect(leading(2, harness.ctx())).toBe(2);
		});

		it("keeps locking calls made after a long-running run started", async () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn(() => gate.promise);
			const leading = leadingTask(handler);
			leading(1, harness.ctx());
			for (let index = 0; index < 20; index++) {
				leading(index, harness.ctx());
			}
			gate.resolve();
			await Promise.resolve();

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("keeps separate instances independent", () => {
			const harness = createHarness();
			const gate = deferred();
			const first = leadingTask(() => gate.promise);
			const second = vi.fn();
			first(1, harness.ctx());
			leadingTask(second)(1, harness.ctx());

			expect(second).toHaveBeenCalledTimes(1);
			gate.resolve();
		});

		it("resolves with the result of the run", async () => {
			const harness = createHarness();

			await expect(
				leadingTask(async (value: number) => value * 3)(2, harness.ctx()),
			).resolves.toBe(6);
		});

		it("a dropped call does not abort its own task", () => {
			const harness = createHarness();
			const gate = deferred();
			const leading = leadingTask(() => gate.promise);
			leading(1, harness.ctx());
			const droppedCtx = harness.ctx();
			leading(2, droppedCtx);

			expect(droppedCtx.signal.aborted).toBe(false);
			gate.resolve();
		});
	});

	describe("abort", () => {
		it("gives fn the original task context", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const signals: AbortSignal[] = [];
			leadingTask((_: number, ctx) => {
				signals.push(ctx.signal);
			})(1, ctx);

			expect(signals[0]).toBe(ctx.signal);
		});

		it("aborting the task aborts the running fn", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const signals: AbortSignal[] = [];
			leadingTask((_: number, ctx) => {
				signals.push(ctx.signal);
				return new Promise(() => {});
			})(1, ctx);
			ctx.abort();

			expect(signals[0]?.aborted).toBe(true);
		});

		it("releases the lock when the running task is aborted, even if fn still runs", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn(() => new Promise(() => {}));
			const leading = leadingTask(handler);
			leading(1, ctx);
			ctx.abort();
			leading(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("an aborted run settling late does not release the lock of a newer run", async () => {
			const harness = createHarness();
			const first = harness.ctx();
			const firstGate = deferred();
			const secondGate = deferred();
			const handler = vi.fn((value: number) =>
				value === 1 ? firstGate.promise : secondGate.promise,
			);
			const leading = leadingTask(handler);
			leading(1, first);
			first.abort();
			leading(2, harness.ctx());
			firstGate.resolve();
			await Promise.resolve();
			await Promise.resolve();
			leading(3, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
			secondGate.resolve();
		});

		it("aborting the task of a dropped call does not release the lock", () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise(() => {}));
			const leading = leadingTask(handler);
			leading(1, harness.ctx());
			const droppedCtx = harness.ctx();
			leading(2, droppedCtx);
			droppedCtx.abort();
			leading(3, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("aborting a task after its run finished changes nothing", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn((value: number) => value);
			const leading = leadingTask(handler);
			leading(1, ctx);
			ctx.abort();

			expect(leading(2, harness.ctx())).toBe(2);
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("a self-abort inside fn releases the lock (saga #2313)", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (_: number, ctx: { abort: () => void }) => {
				ctx.abort();
			});
			harness.bus.on("t", leadingTask(handler));
			harness.bus.emit("t", 1);
			await Promise.resolve();
			await Promise.resolve();
			harness.bus.emit("t", 2);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("ignores a call whose task is already aborted", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			const handler = vi.fn();

			expect(leadingTask(handler)(1, ctx)).toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
			expect(harness.phases()).toEqual([]);
		});

		it("an ignored aborted call does not take the lock", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			const handler = vi.fn((value: number) => value);
			const leading = leadingTask(handler);
			leading(1, ctx);

			expect(leading(2, harness.ctx())).toBe(2);
		});
	});

	describe("trace", () => {
		it("start and done", async () => {
			const harness = createHarness();
			await leadingTask(async () => {})(1, harness.ctx());

			expect(harness.phases()).toEqual(["leading/start", "leading/done"]);
		});

		it("reports a dropped call", () => {
			const harness = createHarness();
			const leading = leadingTask(() => new Promise(() => {}));
			leading(1, harness.ctx());
			leading(2, harness.ctx());

			expect(harness.phases()).toEqual(["leading/start", "leading/drop"]);
		});

		it("reports start, drop, done in order", async () => {
			const harness = createHarness();
			const gate = deferred();
			const leading = leadingTask(() => gate.promise);
			const first = leading(1, harness.ctx());
			leading(2, harness.ctx());
			gate.resolve();
			await first;

			expect(harness.phases()).toEqual([
				"leading/start",
				"leading/drop",
				"leading/done",
			]);
		});

		it("reports an async error", async () => {
			const harness = createHarness();
			await Promise.resolve(
				leadingTask(async () => {
					throw new Error("boom");
				})(1, harness.ctx()),
			).catch(() => {});

			expect(harness.phases()).toEqual(["leading/start", "leading/error"]);
		});

		it("reports a sync error", () => {
			const harness = createHarness();
			try {
				leadingTask(() => {
					throw new Error("boom");
				})(1, harness.ctx());
			} catch {}

			expect(harness.phases()).toEqual(["leading/start", "leading/error"]);
		});

		it("reports cancel when the task aborts mid-run", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const gate = deferred();
			const promise = leadingTask(() => gate.promise)(1, ctx);
			ctx.abort();
			gate.resolve();
			await promise;

			expect(harness.phases()).toEqual(["leading/start", "leading/cancel"]);
		});
	});

	describe("on a bus", () => {
		it("runs once for a burst while the first is in flight", () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn(() => gate.promise);
			harness.bus.on("t", leadingTask(handler));
			harness.bus.emit("t", 1);
			harness.bus.emit("t", 2);
			harness.bus.emit("t", 3);

			expect(handler).toHaveBeenCalledTimes(1);
			gate.resolve();
		});
	});
});
