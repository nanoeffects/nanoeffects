import { describe, expect, it, vi } from "vitest";
import type { Context } from "../core/bus";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { latest } from "./latest";

/** Pins the event map so a bare `fn` infers `Context<TestEvents>`. */
const latestTask = <P, R>(handler: Task<P, TestEvents, R>) => latest(handler);

describe("latest", () => {
	describe("results", () => {
		it("calls fn with the payload and the task context", () => {
			const harness = createHarness();
			const handler = vi.fn();
			latestTask(handler)(5, harness.ctx());

			expect(handler.mock.calls[0]?.[0]).toBe(5);
			expect(handler.mock.calls[0]?.[1].type).toBe("t");
		});

		it("returns a sync result as is", () => {
			const harness = createHarness();

			expect(latestTask((value: number) => value * 2)(4, harness.ctx())).toBe(
				8,
			);
		});

		it("resolves an async result", async () => {
			const harness = createHarness();

			await expect(
				latestTask(async (value: number) => value * 2)(4, harness.ctx()),
			).resolves.toBe(8);
		});

		it("gives fn a signal of its own, not the parent one", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const signals: AbortSignal[] = [];
			latestTask((_: number, ctx) => {
				signals.push(ctx.signal);
			})(1, ctx);

			expect(signals[0]).not.toBe(ctx.signal);
		});

		it("works as a bus handler", () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("t", latestTask(handler));
			harness.bus.emit("t", 3);

			expect(handler.mock.calls[0]?.[0]).toBe(3);
		});
	});

	describe("superseding", () => {
		it("aborts the previous run when a new call arrives", () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const handler = latestTask((_: number, ctx) => {
				signals.push(ctx.signal);
				return new Promise(() => {});
			});
			handler(1, harness.ctx());
			expect(signals[0]?.aborted).toBe(false);
			handler(2, harness.ctx());

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[1]?.aborted).toBe(false);
		});

		it("drops the result of a superseded run", async () => {
			const harness = createHarness();
			const firstGate = deferred<string>();
			const secondGate = deferred<string>();
			const handler = latestTask((value: number) =>
				value === 1 ? firstGate.promise : secondGate.promise,
			);
			const first = handler(1, harness.ctx());
			const second = handler(2, harness.ctx());
			secondGate.resolve("second");
			firstGate.resolve("first");

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe("second");
		});

		it("drops a superseded result even when it resolves last", async () => {
			const harness = createHarness();
			const firstGate = deferred<string>();
			const handler = latestTask((value: number) =>
				value === 1 ? firstGate.promise : "fast",
			);
			const first = handler(1, harness.ctx());
			const second = handler(2, harness.ctx());

			await expect(second).toBe("fast");
			firstGate.resolve("slow");
			await expect(first).resolves.toBeUndefined();
		});

		it("swallows a rejection of a superseded run", async () => {
			const harness = createHarness();
			const firstGate = deferred<string>();
			const handler = latestTask((value: number) =>
				value === 1 ? firstGate.promise : "ok",
			);
			const first = handler(1, harness.ctx());
			handler(2, harness.ctx());
			firstGate.reject(new Error("late"));

			await expect(first).resolves.toBeUndefined();
		});

		it("runs only the last of many rapid calls to completion", async () => {
			const harness = createHarness();
			const done = vi.fn();
			const handler = latestTask(async (value: number, ctx) => {
				await new Promise((result) => setTimeout(result, 5));
				if (!ctx.signal.aborted) {
					done(value);
				}
			});
			for (let index = 1; index <= 10; index++) {
				handler(index, harness.ctx());
			}
			await new Promise((result) => setTimeout(result, 30));

			expect(done).toHaveBeenCalledTimes(1);
			expect(done).toHaveBeenCalledWith(10);
		});

		it("starts fresh after the previous run finished", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const handler = latestTask(async (_: number, ctx) => {
				signals.push(ctx.signal);
			});
			await handler(1, harness.ctx());
			await handler(2, harness.ctx());

			expect(signals[0]?.aborted).toBe(false);
		});

		it("lets a cleanup handler of the superseded run fire (saga: cancel fetch)", () => {
			const harness = createHarness();
			const cleanup = vi.fn();
			const handler = latestTask((_: number, ctx) => {
				ctx.signal.addEventListener("abort", cleanup);
				return new Promise(() => {});
			});
			handler(1, harness.ctx());
			expect(cleanup).not.toHaveBeenCalled();
			handler(2, harness.ctx());

			expect(cleanup).toHaveBeenCalledTimes(1);
		});

		it("a late finish of a superseded run does not free the slot of the newer run (saga #1242)", async () => {
			const harness = createHarness();
			const firstGate = deferred();
			const secondGate = deferred();
			const signals: AbortSignal[] = [];
			const handler = latestTask((value: number, ctx) => {
				signals.push(ctx.signal);
				return value === 1 ? firstGate.promise : secondGate.promise;
			});
			handler(1, harness.ctx());
			handler(2, harness.ctx());
			firstGate.resolve();
			await Promise.resolve();
			await Promise.resolve();
			handler(3, harness.ctx());

			expect(signals[1]?.aborted).toBe(true);
		});

		it("one instance shares one slot across event types (saga: keyed takeLatest needs one instance per key)", () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const handler = latestTask((_: unknown, ctx) => {
				signals.push(ctx.signal);
				return new Promise(() => {});
			});
			harness.bus.on("t", handler);
			harness.bus.on("b", handler);
			harness.bus.emit("t", 1);
			harness.bus.emit("b", "x");

			expect(signals[0]?.aborted).toBe(true);
		});

		it("separate instances do not cancel each other (keyed takeLatest)", () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const make = () =>
				latestTask((_: number, ctx) => {
					signals.push(ctx.signal);
					return new Promise(() => {});
				});
			const first = make();
			const second = make();
			first(1, harness.ctx());
			second(1, harness.ctx());
			first(2, harness.ctx());

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[1]?.aborted).toBe(false);
		});
	});

	describe("errors", () => {
		it("rethrows a sync error", () => {
			const harness = createHarness();
			const handler = latestTask(() => {
				throw new Error("boom");
			});

			expect(() => handler(1, harness.ctx())).toThrow("boom");
		});

		it("rejects with an async error of the current run", async () => {
			const harness = createHarness();
			const handler = latestTask(async () => {
				throw new Error("boom");
			});

			await expect(handler(1, harness.ctx())).rejects.toThrow("boom");
		});

		it("frees the slot after a sync error", () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const handler = latestTask((value: number, ctx) => {
				signals.push(ctx.signal);
				if (value === 1) {
					throw new Error("boom");
				}
			});
			expect(() => handler(1, harness.ctx())).toThrow();
			handler(2, harness.ctx());

			expect(signals[0]?.aborted).toBe(false);
		});

		it("frees the slot after an async error", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const handler = latestTask(async (value: number, ctx) => {
				signals.push(ctx.signal);
				if (value === 1) {
					throw new Error("boom");
				}
			});
			await Promise.resolve(handler(1, harness.ctx())).catch(() => {});
			await handler(2, harness.ctx());

			expect(signals[0]?.aborted).toBe(false);
		});

		it("returns nothing when the run is aborted and then throws sync", () => {
			const harness = createHarness();
			const handler = latestTask((_: number, ctx) => {
				ctx.abort();
				throw new Error("after abort");
			});

			expect(handler(1, harness.ctx())).toBeUndefined();
		});

		it("swallows an error thrown because the run was aborted", async () => {
			const harness = createHarness();
			const handler = latestTask(
				(_: number, ctx) =>
					new Promise((_resolve, reject) => {
						ctx.signal.addEventListener("abort", () =>
							reject(ctx.signal.reason),
						);
					}),
			);
			const first = handler(1, harness.ctx());
			handler(2, harness.ctx());

			await expect(first).resolves.toBeUndefined();
		});
	});

	describe("parent task", () => {
		it("does not run when the parent is already aborted", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			const handler = vi.fn();

			expect(latestTask(handler)(1, ctx)).toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});

		it("aborts the running fn when the parent aborts", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const signals: AbortSignal[] = [];
			latestTask((_: number, ctx) => {
				signals.push(ctx.signal);
				return new Promise(() => {});
			})(1, ctx);
			ctx.abort("parent gone");

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[0]?.reason).toBe("parent gone");
		});

		it("drops the result when the parent aborts mid-run", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const gate = deferred<string>();
			const promise = latestTask(() => gate.promise)(1, ctx);
			ctx.abort();
			gate.resolve("late");

			await expect(promise).resolves.toBeUndefined();
		});

		it("aborting the fn context does not abort the parent", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			latestTask((_: number, ctx) => {
				ctx.abort();
			})(1, ctx);

			expect(ctx.signal.aborted).toBe(false);
		});

		it("self-abort inside fn does not stop later calls (saga #2313)", () => {
			const harness = createHarness();
			const calls: number[] = [];
			harness.bus.on(
				"t",
				latestTask((value: number, ctx) => {
					calls.push(value);
					ctx.abort();
				}),
			);
			harness.bus.emit("t", 1);
			harness.bus.emit("t", 2);

			expect(calls).toEqual([1, 2]);
		});

		it("emit from a superseded run is a no-op, from the current run it works", () => {
			const harness = createHarness();
			const seen = vi.fn();
			harness.bus.on("b", seen);
			const ctxs: Context<TestEvents>[] = [];
			const handler = latestTask((_: number, ctx) => {
				ctxs.push(ctx);
				return new Promise(() => {});
			});
			handler(1, harness.ctx());
			handler(2, harness.ctx());
			ctxs[0]?.emit("b", "stale");
			ctxs[1]?.emit("b", "fresh");

			expect(seen).toHaveBeenCalledTimes(1);
			expect(seen.mock.calls[0]?.[0]).toBe("fresh");
		});

		it("cascades the abort into children started with ctx.run", async () => {
			const harness = createHarness();
			const gate = deferred();
			const childSignals: AbortSignal[] = [];
			const handler = latestTask((_: number, ctx) =>
				ctx.run((_: number, child) => {
					childSignals.push(child.signal);
					return gate.promise;
				}, 1),
			);
			const first = handler(1, harness.ctx());
			handler(2, harness.ctx());

			expect(childSignals[0]?.aborted).toBe(true);
			expect(childSignals[1]?.aborted).toBe(false);
			gate.resolve();
			await first;
		});
	});

	describe("trace", () => {
		it("start then done", async () => {
			const harness = createHarness();
			await latestTask(async () => {})(1, harness.ctx());

			expect(harness.phases()).toEqual(["latest/start", "latest/done"]);
		});

		it("start then done for a sync fn", () => {
			const harness = createHarness();
			latestTask(() => 1)(1, harness.ctx());

			expect(harness.phases()).toEqual(["latest/start", "latest/done"]);
		});

		it("cancel is reported at once when superseded, not when the old run settles", () => {
			const harness = createHarness();
			const handler = latestTask(() => new Promise(() => {}));
			handler(1, harness.ctx());
			handler(2, harness.ctx());

			expect(harness.phases()).toEqual([
				"latest/start",
				"latest/cancel",
				"latest/start",
			]);
		});

		it("a superseded run settling later adds no event", async () => {
			const harness = createHarness();
			const firstGate = deferred();
			const secondGate = deferred();
			const handler = latestTask((value: number) =>
				value === 1 ? firstGate.promise : secondGate.promise,
			);
			handler(1, harness.ctx());
			handler(2, harness.ctx());
			secondGate.resolve();
			await Promise.resolve();
			await Promise.resolve();
			const before = harness.phases().length;
			firstGate.resolve();
			await Promise.resolve();
			await Promise.resolve();

			expect(harness.phases()).toHaveLength(before);
			expect(harness.phases()).toEqual([
				"latest/start",
				"latest/cancel",
				"latest/start",
				"latest/done",
			]);
		});

		it("reports an async error", async () => {
			const harness = createHarness();
			const error = new Error("boom");
			await Promise.resolve(
				latestTask(async () => {
					throw error;
				})(1, harness.ctx()),
			).catch(() => {});

			expect(harness.phases()).toEqual(["latest/start", "latest/error"]);
			expect(harness.recorder.events.at(-1)?.error).toBe(error);
		});

		it("reports a sync error", () => {
			const harness = createHarness();
			try {
				latestTask(() => {
					throw new Error("boom");
				})(1, harness.ctx());
			} catch {}

			expect(harness.phases()).toEqual(["latest/start", "latest/error"]);
		});

		it("reports cancel when the parent aborts", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			latestTask(() => new Promise(() => {}))(1, ctx);
			ctx.abort();

			expect(harness.phases()).toEqual(["latest/start", "latest/cancel"]);
		});

		it("reports nothing when the parent is already aborted", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			latestTask(() => 1)(1, ctx);

			expect(harness.phases()).toEqual([]);
		});

		it("reports each run exactly once", async () => {
			const harness = createHarness();
			const handler = latestTask(async (_: number, ctx) => {
				await new Promise((result) => setTimeout(result, 2));
				return ctx.signal.aborted;
			});
			for (let index = 0; index < 5; index++) {
				handler(index, harness.ctx());
			}
			await new Promise((result) => setTimeout(result, 20));
			const phases = harness.phases();

			expect(phases.filter((phase) => phase === "latest/start")).toHaveLength(
				5,
			);
			expect(phases.filter((phase) => phase === "latest/cancel")).toHaveLength(
				4,
			);
			expect(phases.filter((phase) => phase === "latest/done")).toHaveLength(1);
		});

		it("links the run to the handler task as its parent", () => {
			const harness = createHarness();
			latestTask(() => 1)(1, harness.ctx());

			expect(harness.recorder.events[0]?.parent).toBeTypeOf("number");
		});
	});
});
