// Scenarios taken from open and closed issues of effector and patronum:
//  - effector #633, #921, #880: ordering and re-entrancy of parallel calls
//  - effector #47: a node reached by two paths ("diamond")
//  - effector #90: an error in one subscriber and the others
//  - patronum #237: no tick after `interval` stops
//  - patronum #249, #262: double trigger when throttle and debounce are chained
//  - patronum #283: throttle edges after the window passes (lodash semantics)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBus } from "./bus";
import { poll } from "./effects";
import { debounce, latest, leading, queue, throttle } from "./policies";
import { createHarness, type TestEvents } from "./test-helpers";
import type { Task } from "./types";

const lat = <P, R>(fn: Task<P, TestEvents, R>) => latest(fn);
const lead = <P, R>(fn: Task<P, TestEvents, R>) => leading(fn);
const que = <P, R>(fn: Task<P, TestEvents, R>) => queue(fn);
const thr = <P, R>(ms: number, fn: Task<P, TestEvents, R>) => throttle(ms, fn);
const deb = <P, R>(ms: number, fn: Task<P, TestEvents, R>) => debounce(ms, fn);

describe("scenarios", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("order of execution (effector #921, #633)", () => {
		it("a nested emit runs its handlers at once, before the handlers after the emitter", () => {
			const h = createHarness();
			const log: string[] = [];
			h.bus.on("t", (_, ctx) => {
				log.push("A start");
				ctx.emit("b", "x");
				log.push("A end");
			});
			h.bus.on("b", () => log.push("B"));
			h.bus.on("t", () => log.push("C"));
			h.bus.emit("t", 1);

			expect(log).toEqual(["A start", "B", "A end", "C"]);
		});

		it("handlers run in subscription order, whatever they subscribed to", () => {
			const h = createHarness();
			const log: string[] = [];
			h.bus.on("t", () => log.push("first"));
			h.bus.on("b", () => log.push("other event"));
			h.bus.on("t", () => log.push("second"));
			h.bus.emit("t", 1);

			expect(log).toEqual(["first", "second"]);
		});

		it("a later handler sees what an earlier one changed (effector #880)", () => {
			const h = createHarness();
			const state = { owner: 0 };
			const seen: number[] = [];
			h.bus.on("t", (n) => {
				state.owner = n;
			});
			h.bus.on("t", () => seen.push(state.owner));
			h.bus.emit("t", 3);

			expect(seen).toEqual([3]);
		});

		it("a node reached by two paths runs twice: there is no dedupe (effector #47)", () => {
			const bus = createBus<{ a: number; b: number; c: number; d: number }>();
			const reached = vi.fn();
			bus.on("a", (n, ctx) => {
				ctx.emit("b", n);
				ctx.emit("c", n);
			});
			bus.on("b", (n, ctx) => ctx.emit("d", n));
			bus.on("c", (n, ctx) => ctx.emit("d", n));
			bus.on("d", reached);
			bus.emit("a", 1);

			expect(reached).toHaveBeenCalledTimes(2);
		});

		it("an error in one handler does not run the rest unless onError is set (effector #90)", () => {
			const calls: string[] = [];
			const make = (onError?: () => void) => {
				const bus = createBus<TestEvents>(onError ? { onError } : {});
				bus.on("t", () => {
					calls.push("bad");
					throw new Error("boom");
				});
				bus.on("t", () => calls.push("other"));
				return bus;
			};
			expect(() => make().emit("t", 1)).toThrow("boom");
			expect(calls).toEqual(["bad"]);

			calls.length = 0;
			make(() => {}).emit("t", 1);
			expect(calls).toEqual(["bad", "other"]);
		});
	});

	describe("re-entrancy: a handler emits its own event", () => {
		it("leading drops the nested call, because the lock is taken before fn runs", () => {
			const h = createHarness();
			const calls: number[] = [];
			h.bus.on(
				"t",
				lead((n: number, ctx) => {
					calls.push(n);
					ctx.emit("t", n + 1);
				}),
			);
			h.bus.emit("t", 1);

			expect(calls).toEqual([1]);
			expect(h.phases()).toEqual([
				"leading/start",
				"leading/drop",
				"leading/done",
			]);
		});

		it("queue runs the nested call after the current one, never inside it", async () => {
			const h = createHarness();
			const calls: number[] = [];
			let depth = 0;
			let maxDepth = 0;
			h.bus.on(
				"t",
				que((n: number, ctx) => {
					depth++;
					maxDepth = Math.max(maxDepth, depth);
					calls.push(n);
					if (n < 3) {
						ctx.emit("t", n + 1);
					}
					depth--;
				}),
			);
			h.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(0);

			expect(calls).toEqual([1, 2, 3]);
			expect(maxDepth).toBe(1);
		});

		it("latest aborts the outer run that is still executing", () => {
			const h = createHarness();
			const signals: AbortSignal[] = [];
			h.bus.on(
				"t",
				lat((n: number, ctx) => {
					signals.push(ctx.signal);
					if (n === 1) {
						ctx.emit("t", 2);
					}
				}),
			);
			h.bus.emit("t", 1);

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[1]?.aborted).toBe(false);
			expect(h.phases()).toEqual([
				"latest/start",
				"latest/cancel",
				"latest/start",
				"latest/done",
			]);
		});

		it("throttle holds the nested call until the window closes", async () => {
			const h = createHarness();
			const calls: number[] = [];
			h.bus.on(
				"t",
				thr(100, (n: number, ctx) => {
					calls.push(n);
					if (n === 1) {
						ctx.emit("t", 2);
					}
				}),
			);
			h.bus.emit("t", 1);
			expect(calls).toEqual([1]);
			await vi.advanceTimersByTimeAsync(100);

			expect(calls).toEqual([1, 2]);
		});

		it("debounce restarts its wait for the nested call", async () => {
			const h = createHarness();
			const calls: number[] = [];
			h.bus.on(
				"t",
				deb(100, (n: number, ctx) => {
					calls.push(n);
					if (n === 1) {
						ctx.emit("t", 2);
					}
				}),
			);
			h.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(100);
			expect(calls).toEqual([1]);
			await vi.advanceTimersByTimeAsync(100);

			expect(calls).toEqual([1, 2]);
		});
	});

	describe("chained policies: no double trigger (patronum #249, #262)", () => {
		const burst = (h: ReturnType<typeof createHarness>) => {
			for (let n = 1; n <= 5; n++) {
				h.bus.emit("t", n);
			}
		};

		it("debounce after throttle calls fn once, with the last payload", async () => {
			const h = createHarness();
			const fn = vi.fn();
			h.bus.on("t", deb(50, thr(100, fn)));
			burst(h);
			await vi.advanceTimersByTimeAsync(1000);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([5]);
		});

		it("throttle after debounce calls fn for the leading and the trailing call, once each", async () => {
			const h = createHarness();
			const fn = vi.fn();
			h.bus.on("t", thr(100, deb(50, fn)));
			burst(h);
			await vi.advanceTimersByTimeAsync(1000);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 5]);
		});

		it("debounce inside debounce calls fn once", async () => {
			const h = createHarness();
			const fn = vi.fn();
			h.bus.on("t", deb(50, deb(50, fn)));
			burst(h);
			await vi.advanceTimersByTimeAsync(1000);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([5]);
		});

		it("latest over debounce calls fn once", async () => {
			const h = createHarness();
			const fn = vi.fn();
			h.bus.on("t", lat(deb(50, fn)));
			burst(h);
			await vi.advanceTimersByTimeAsync(1000);

			expect(fn.mock.calls.map((c) => c[0])).toEqual([5]);
		});

		it("two chains on the same event each fire once", async () => {
			const h = createHarness();
			const a = vi.fn();
			const b = vi.fn();
			h.bus.on("t", deb(50, a));
			h.bus.on("t", deb(50, b));
			burst(h);
			await vi.advanceTimersByTimeAsync(1000);

			expect(a).toHaveBeenCalledTimes(1);
			expect(b).toHaveBeenCalledTimes(1);
		});

		it("the same policy instance on a chain of events keeps one state", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const shared = deb(50, fn);
			h.bus.on("t", shared);
			h.bus.on("t", shared);
			burst(h);
			await vi.advanceTimersByTimeAsync(1000);

			expect(fn).toHaveBeenCalledTimes(1);
		});
	});

	describe("throttle edges (patronum #283)", () => {
		it("a call made after a quiet window runs at once, as the patronum reviewer expects", async () => {
			const h = createHarness();
			const calls: number[] = [];
			h.bus.on(
				"t",
				thr(100, (n: number) => calls.push(n)),
			);
			h.bus.emit("t", 1);
			h.bus.emit("t", 2);
			h.bus.emit("t", 3);
			await vi.advanceTimersByTimeAsync(110);
			expect(calls).toEqual([1, 3]);
			h.bus.emit("t", 4);

			expect(calls).toEqual([1, 3, 4]);
		});

		it("a call after a window with no calls is immediate", async () => {
			const h = createHarness();
			const calls: number[] = [];
			h.bus.on(
				"t",
				thr(100, (n: number) => calls.push(n)),
			);
			h.bus.emit("t", 1);
			h.bus.emit("t", 2);
			await vi.advanceTimersByTimeAsync(250);
			h.bus.emit("t", 3);

			expect(calls).toEqual([1, 2, 3]);
		});

		it("a lone call fires once, with no trailing repeat", async () => {
			const h = createHarness();
			const calls: number[] = [];
			h.bus.on(
				"t",
				thr(100, (n: number) => calls.push(n)),
			);
			h.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(1000);

			expect(calls).toEqual([1]);
		});
	});

	describe("poll stops for good (patronum #237)", () => {
		it("does not tick when the task aborts just before a tick is due", async () => {
			const controller = new AbortController();
			const fn = vi.fn();
			poll(controller, fn, 100);
			await vi.advanceTimersByTimeAsync(99);
			controller.abort();
			await vi.advanceTimersByTimeAsync(1000);

			expect(fn).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("does not tick again after a tick that aborted its own task", async () => {
			const controller = new AbortController();
			const fn = vi.fn((tick: number) => {
				if (tick === 1) {
					controller.abort();
				}
			});
			const done = poll(controller, fn, 100);
			await vi.advanceTimersByTimeAsync(1000);

			await expect(done).resolves.toBeUndefined();
			expect(fn).toHaveBeenCalledTimes(2);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("a new poll works after the previous one stopped", async () => {
			const first = new AbortController();
			const second = new AbortController();
			const fn = vi.fn();
			poll(first, fn, 100);
			await vi.advanceTimersByTimeAsync(150);
			first.abort();
			poll(second, fn, 100);
			await vi.advanceTimersByTimeAsync(150);
			second.abort();

			expect(fn).toHaveBeenCalledTimes(2);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("two polls on different tasks do not stop each other", async () => {
			const a = new AbortController();
			const b = new AbortController();
			const fnA = vi.fn();
			const fnB = vi.fn();
			poll(a, fnA, 100);
			poll(b, fnB, 100);
			a.abort();
			await vi.advanceTimersByTimeAsync(250);
			b.abort();

			expect(fnA).not.toHaveBeenCalled();
			expect(fnB).toHaveBeenCalledTimes(2);
		});
	});
});
