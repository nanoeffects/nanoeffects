import { describe, expect, it, vi } from "vitest";
import type { Context } from "../bus";
import { createHarness, deferred, type TestEvents } from "../test-helpers";
import type { Task } from "../types";
import { latest } from "./latest";

/** Pins the event map so a bare `fn` infers `Context<TestEvents>`. */
const lat = <P, R>(fn: Task<P, TestEvents, R>) => latest(fn);

describe("latest", () => {
	describe("results", () => {
		it("calls fn with the payload and the task context", () => {
			const h = createHarness();
			const fn = vi.fn();
			lat(fn)(5, h.ctx());

			expect(fn.mock.calls[0]?.[0]).toBe(5);
			expect(fn.mock.calls[0]?.[1].type).toBe("t");
		});

		it("returns a sync result as is", () => {
			const h = createHarness();

			expect(lat((n: number) => n * 2)(4, h.ctx())).toBe(8);
		});

		it("resolves an async result", async () => {
			const h = createHarness();

			await expect(lat(async (n: number) => n * 2)(4, h.ctx())).resolves.toBe(
				8,
			);
		});

		it("gives fn a signal of its own, not the parent one", () => {
			const h = createHarness();
			const ctx = h.ctx();
			const signals: AbortSignal[] = [];
			lat((_: number, c) => {
				signals.push(c.signal);
			})(1, ctx);

			expect(signals[0]).not.toBe(ctx.signal);
		});

		it("works as a bus handler", () => {
			const h = createHarness();
			const fn = vi.fn();
			h.bus.on("t", lat(fn));
			h.bus.emit("t", 3);

			expect(fn.mock.calls[0]?.[0]).toBe(3);
		});
	});

	describe("superseding", () => {
		it("aborts the previous run when a new call arrives", () => {
			const h = createHarness();
			const signals: AbortSignal[] = [];
			const fn = lat((_: number, c) => {
				signals.push(c.signal);
				return new Promise(() => {});
			});
			fn(1, h.ctx());
			expect(signals[0]?.aborted).toBe(false);
			fn(2, h.ctx());

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[1]?.aborted).toBe(false);
		});

		it("drops the result of a superseded run", async () => {
			const h = createHarness();
			const d1 = deferred<string>();
			const d2 = deferred<string>();
			const fn = lat((n: number) => (n === 1 ? d1.promise : d2.promise));
			const first = fn(1, h.ctx());
			const second = fn(2, h.ctx());
			d2.resolve("second");
			d1.resolve("first");

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe("second");
		});

		it("drops a superseded result even when it resolves last", async () => {
			const h = createHarness();
			const d1 = deferred<string>();
			const fn = lat((n: number) => (n === 1 ? d1.promise : "fast"));
			const first = fn(1, h.ctx());
			const second = fn(2, h.ctx());

			await expect(second).toBe("fast");
			d1.resolve("slow");
			await expect(first).resolves.toBeUndefined();
		});

		it("swallows a rejection of a superseded run", async () => {
			const h = createHarness();
			const d1 = deferred<string>();
			const fn = lat((n: number) => (n === 1 ? d1.promise : "ok"));
			const first = fn(1, h.ctx());
			fn(2, h.ctx());
			d1.reject(new Error("late"));

			await expect(first).resolves.toBeUndefined();
		});

		it("runs only the last of many rapid calls to completion", async () => {
			const h = createHarness();
			const done = vi.fn();
			const fn = lat(async (n: number, c) => {
				await new Promise((r) => setTimeout(r, 5));
				if (!c.signal.aborted) {
					done(n);
				}
			});
			for (let i = 1; i <= 10; i++) {
				fn(i, h.ctx());
			}
			await new Promise((r) => setTimeout(r, 30));

			expect(done).toHaveBeenCalledTimes(1);
			expect(done).toHaveBeenCalledWith(10);
		});

		it("starts fresh after the previous run finished", async () => {
			const h = createHarness();
			const signals: AbortSignal[] = [];
			const fn = lat(async (_: number, c) => {
				signals.push(c.signal);
			});
			await fn(1, h.ctx());
			await fn(2, h.ctx());

			expect(signals[0]?.aborted).toBe(false);
		});

		it("lets a cleanup handler of the superseded run fire (saga: cancel fetch)", () => {
			const h = createHarness();
			const cleanup = vi.fn();
			const fn = lat((_: number, c) => {
				c.signal.addEventListener("abort", cleanup);
				return new Promise(() => {});
			});
			fn(1, h.ctx());
			expect(cleanup).not.toHaveBeenCalled();
			fn(2, h.ctx());

			expect(cleanup).toHaveBeenCalledTimes(1);
		});

		it("a late finish of a superseded run does not free the slot of the newer run (saga #1242)", async () => {
			const h = createHarness();
			const d1 = deferred();
			const d2 = deferred();
			const signals: AbortSignal[] = [];
			const fn = lat((n: number, c) => {
				signals.push(c.signal);
				return n === 1 ? d1.promise : d2.promise;
			});
			fn(1, h.ctx());
			fn(2, h.ctx());
			d1.resolve();
			await Promise.resolve();
			await Promise.resolve();
			fn(3, h.ctx());

			expect(signals[1]?.aborted).toBe(true);
		});

		it("one instance shares one slot across event types (saga: keyed takeLatest needs one instance per key)", () => {
			const h = createHarness();
			const signals: AbortSignal[] = [];
			const fn = lat((_: unknown, c) => {
				signals.push(c.signal);
				return new Promise(() => {});
			});
			h.bus.on("t", fn);
			h.bus.on("b", fn);
			h.bus.emit("t", 1);
			h.bus.emit("b", "x");

			expect(signals[0]?.aborted).toBe(true);
		});

		it("separate instances do not cancel each other (keyed takeLatest)", () => {
			const h = createHarness();
			const signals: AbortSignal[] = [];
			const make = () =>
				lat((_: number, c) => {
					signals.push(c.signal);
					return new Promise(() => {});
				});
			const a = make();
			const b = make();
			a(1, h.ctx());
			b(1, h.ctx());
			a(2, h.ctx());

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[1]?.aborted).toBe(false);
		});
	});

	describe("errors", () => {
		it("rethrows a sync error", () => {
			const h = createHarness();
			const fn = lat(() => {
				throw new Error("boom");
			});

			expect(() => fn(1, h.ctx())).toThrow("boom");
		});

		it("rejects with an async error of the current run", async () => {
			const h = createHarness();
			const fn = lat(async () => {
				throw new Error("boom");
			});

			await expect(fn(1, h.ctx())).rejects.toThrow("boom");
		});

		it("frees the slot after a sync error", () => {
			const h = createHarness();
			const signals: AbortSignal[] = [];
			const fn = lat((n: number, c) => {
				signals.push(c.signal);
				if (n === 1) {
					throw new Error("boom");
				}
			});
			expect(() => fn(1, h.ctx())).toThrow();
			fn(2, h.ctx());

			expect(signals[0]?.aborted).toBe(false);
		});

		it("frees the slot after an async error", async () => {
			const h = createHarness();
			const signals: AbortSignal[] = [];
			const fn = lat(async (n: number, c) => {
				signals.push(c.signal);
				if (n === 1) {
					throw new Error("boom");
				}
			});
			await Promise.resolve(fn(1, h.ctx())).catch(() => {});
			await fn(2, h.ctx());

			expect(signals[0]?.aborted).toBe(false);
		});

		it("returns nothing when the run is aborted and then throws sync", () => {
			const h = createHarness();
			const fn = lat((_: number, c) => {
				c.abort();
				throw new Error("after abort");
			});

			expect(fn(1, h.ctx())).toBeUndefined();
		});

		it("swallows an error thrown because the run was aborted", async () => {
			const h = createHarness();
			const fn = lat(
				(_: number, c) =>
					new Promise((_resolve, reject) => {
						c.signal.addEventListener("abort", () => reject(c.signal.reason));
					}),
			);
			const first = fn(1, h.ctx());
			fn(2, h.ctx());

			await expect(first).resolves.toBeUndefined();
		});
	});

	describe("parent task", () => {
		it("does not run when the parent is already aborted", () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort();
			const fn = vi.fn();

			expect(lat(fn)(1, ctx)).toBeUndefined();
			expect(fn).not.toHaveBeenCalled();
		});

		it("aborts the running fn when the parent aborts", () => {
			const h = createHarness();
			const ctx = h.ctx();
			const signals: AbortSignal[] = [];
			lat((_: number, c) => {
				signals.push(c.signal);
				return new Promise(() => {});
			})(1, ctx);
			ctx.abort("parent gone");

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[0]?.reason).toBe("parent gone");
		});

		it("drops the result when the parent aborts mid-run", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const d = deferred<string>();
			const promise = lat(() => d.promise)(1, ctx);
			ctx.abort();
			d.resolve("late");

			await expect(promise).resolves.toBeUndefined();
		});

		it("aborting the fn context does not abort the parent", () => {
			const h = createHarness();
			const ctx = h.ctx();
			lat((_: number, c) => {
				c.abort();
			})(1, ctx);

			expect(ctx.signal.aborted).toBe(false);
		});

		it("self-abort inside fn does not stop later calls (saga #2313)", () => {
			const h = createHarness();
			const calls: number[] = [];
			h.bus.on(
				"t",
				lat((n: number, c) => {
					calls.push(n);
					c.abort();
				}),
			);
			h.bus.emit("t", 1);
			h.bus.emit("t", 2);

			expect(calls).toEqual([1, 2]);
		});

		it("emit from a superseded run is a no-op, from the current run it works", () => {
			const h = createHarness();
			const seen = vi.fn();
			h.bus.on("b", seen);
			const ctxs: Context<TestEvents>[] = [];
			const fn = lat((_: number, c) => {
				ctxs.push(c);
				return new Promise(() => {});
			});
			fn(1, h.ctx());
			fn(2, h.ctx());
			ctxs[0]?.emit("b", "stale");
			ctxs[1]?.emit("b", "fresh");

			expect(seen).toHaveBeenCalledTimes(1);
			expect(seen.mock.calls[0]?.[0]).toBe("fresh");
		});

		it("cascades the abort into children started with ctx.run", async () => {
			const h = createHarness();
			const d = deferred();
			const childSignals: AbortSignal[] = [];
			const fn = lat((_: number, c) =>
				c.run((_: number, child) => {
					childSignals.push(child.signal);
					return d.promise;
				}, 1),
			);
			const first = fn(1, h.ctx());
			fn(2, h.ctx());

			expect(childSignals[0]?.aborted).toBe(true);
			expect(childSignals[1]?.aborted).toBe(false);
			d.resolve();
			await first;
		});
	});

	describe("trace", () => {
		it("start then done", async () => {
			const h = createHarness();
			await lat(async () => {})(1, h.ctx());

			expect(h.phases()).toEqual(["latest/start", "latest/done"]);
		});

		it("start then done for a sync fn", () => {
			const h = createHarness();
			lat(() => 1)(1, h.ctx());

			expect(h.phases()).toEqual(["latest/start", "latest/done"]);
		});

		it("cancel is reported at once when superseded, not when the old run settles", () => {
			const h = createHarness();
			const fn = lat(() => new Promise(() => {}));
			fn(1, h.ctx());
			fn(2, h.ctx());

			expect(h.phases()).toEqual([
				"latest/start",
				"latest/cancel",
				"latest/start",
			]);
		});

		it("a superseded run settling later adds no event", async () => {
			const h = createHarness();
			const d1 = deferred();
			const d2 = deferred();
			const fn = lat((n: number) => (n === 1 ? d1.promise : d2.promise));
			fn(1, h.ctx());
			fn(2, h.ctx());
			d2.resolve();
			await Promise.resolve();
			await Promise.resolve();
			const before = h.phases().length;
			d1.resolve();
			await Promise.resolve();
			await Promise.resolve();

			expect(h.phases()).toHaveLength(before);
			expect(h.phases()).toEqual([
				"latest/start",
				"latest/cancel",
				"latest/start",
				"latest/done",
			]);
		});

		it("reports an async error", async () => {
			const h = createHarness();
			const error = new Error("boom");
			await Promise.resolve(
				lat(async () => {
					throw error;
				})(1, h.ctx()),
			).catch(() => {});

			expect(h.phases()).toEqual(["latest/start", "latest/error"]);
			expect(h.recorder.events.at(-1)?.error).toBe(error);
		});

		it("reports a sync error", () => {
			const h = createHarness();
			try {
				lat(() => {
					throw new Error("boom");
				})(1, h.ctx());
			} catch {}

			expect(h.phases()).toEqual(["latest/start", "latest/error"]);
		});

		it("reports cancel when the parent aborts", () => {
			const h = createHarness();
			const ctx = h.ctx();
			lat(() => new Promise(() => {}))(1, ctx);
			ctx.abort();

			expect(h.phases()).toEqual(["latest/start", "latest/cancel"]);
		});

		it("reports nothing when the parent is already aborted", () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort();
			lat(() => 1)(1, ctx);

			expect(h.phases()).toEqual([]);
		});

		it("reports each run exactly once", async () => {
			const h = createHarness();
			const fn = lat(async (_: number, c) => {
				await new Promise((r) => setTimeout(r, 2));
				return c.signal.aborted;
			});
			for (let i = 0; i < 5; i++) {
				fn(i, h.ctx());
			}
			await new Promise((r) => setTimeout(r, 20));
			const phases = h.phases();

			expect(phases.filter((p) => p === "latest/start")).toHaveLength(5);
			expect(phases.filter((p) => p === "latest/cancel")).toHaveLength(4);
			expect(phases.filter((p) => p === "latest/done")).toHaveLength(1);
		});

		it("links the run to the handler task as its parent", () => {
			const h = createHarness();
			lat(() => 1)(1, h.ctx());

			expect(h.recorder.events[0]?.parent).toBeTypeOf("number");
		});
	});
});
