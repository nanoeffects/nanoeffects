// Scenarios taken from open and closed issues of effector and patronum:
//  - effector #633, #921, #880: ordering and re-entrancy of parallel calls
//  - effector #47: a node reached by two paths ("diamond")
//  - effector #90: an error in one subscriber and the others
//  - patronum #237: no tick after `interval` stops
//  - patronum #249, #262: double trigger when throttle and debounce are chained
//  - patronum #283: throttle edges after the window passes (lodash semantics)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { Task } from "../core/types";
import { poll } from "../effects";
import { debounce, latest, leading, queue, throttle } from "../policies";
import { createHarness, type TestEvents } from "./test-helpers";

const latestTask = <P, R>(handler: Task<P, TestEvents, R>) => latest(handler);
const leadingTask = <P, R>(handler: Task<P, TestEvents, R>) => leading(handler);
const queueTask = <P, R>(handler: Task<P, TestEvents, R>) => queue(handler);
const throttleTask = <P, R>(ms: number, handler: Task<P, TestEvents, R>) =>
	throttle(ms, handler);
const debounceTask = <P, R>(ms: number, handler: Task<P, TestEvents, R>) =>
	debounce(ms, handler);

describe("scenarios", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("order of execution (effector #921, #633)", () => {
		it("a nested emit runs its handlers at once, before the handlers after the emitter", () => {
			const harness = createHarness();
			const log: string[] = [];
			harness.bus.on("t", (_, ctx) => {
				log.push("A start");
				ctx.emit("b", "x");
				log.push("A end");
			});
			harness.bus.on("b", () => log.push("B"));
			harness.bus.on("t", () => log.push("C"));
			harness.bus.emit("t", 1);

			expect(log).toEqual(["A start", "B", "A end", "C"]);
		});

		it("handlers run in subscription order, whatever they subscribed to", () => {
			const harness = createHarness();
			const log: string[] = [];
			harness.bus.on("t", () => log.push("first"));
			harness.bus.on("b", () => log.push("other event"));
			harness.bus.on("t", () => log.push("second"));
			harness.bus.emit("t", 1);

			expect(log).toEqual(["first", "second"]);
		});

		it("a later handler sees what an earlier one changed (effector #880)", () => {
			const harness = createHarness();
			const state = { owner: 0 };
			const seen: number[] = [];
			harness.bus.on("t", (value) => {
				state.owner = value;
			});
			harness.bus.on("t", () => seen.push(state.owner));
			harness.bus.emit("t", 3);

			expect(seen).toEqual([3]);
		});

		it("a node reached by two paths runs twice: there is no dedupe (effector #47)", () => {
			const bus = createBus<{ a: number; b: number; c: number; d: number }>();
			const reached = vi.fn();
			bus.on("a", (value, ctx) => {
				ctx.emit("b", value);
				ctx.emit("c", value);
			});
			bus.on("b", (value, ctx) => ctx.emit("d", value));
			bus.on("c", (value, ctx) => ctx.emit("d", value));
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
			const harness = createHarness();
			const calls: number[] = [];
			harness.bus.on(
				"t",
				leadingTask((value: number, ctx) => {
					calls.push(value);
					ctx.emit("t", value + 1);
				}),
			);
			harness.bus.emit("t", 1);

			expect(calls).toEqual([1]);
			expect(harness.phases()).toEqual([
				"leading/start",
				"leading/drop",
				"leading/done",
			]);
		});

		it("queue runs the nested call after the current one, never inside it", async () => {
			const harness = createHarness();
			const calls: number[] = [];
			let depth = 0;
			let maxDepth = 0;
			harness.bus.on(
				"t",
				queueTask((value: number, ctx) => {
					depth++;
					maxDepth = Math.max(maxDepth, depth);
					calls.push(value);
					if (value < 3) {
						ctx.emit("t", value + 1);
					}
					depth--;
				}),
			);
			harness.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(0);

			expect(calls).toEqual([1, 2, 3]);
			expect(maxDepth).toBe(1);
		});

		it("latest aborts the outer run that is still executing", () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			harness.bus.on(
				"t",
				latestTask((value: number, ctx) => {
					signals.push(ctx.signal);
					if (value === 1) {
						ctx.emit("t", 2);
					}
				}),
			);
			harness.bus.emit("t", 1);

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[1]?.aborted).toBe(false);
			expect(harness.phases()).toEqual([
				"latest/start",
				"latest/cancel",
				"latest/start",
				"latest/done",
			]);
		});

		it("throttle holds the nested call until the window closes", async () => {
			const harness = createHarness();
			const calls: number[] = [];
			harness.bus.on(
				"t",
				throttleTask(100, (value: number, ctx) => {
					calls.push(value);
					if (value === 1) {
						ctx.emit("t", 2);
					}
				}),
			);
			harness.bus.emit("t", 1);
			expect(calls).toEqual([1]);
			await vi.advanceTimersByTimeAsync(100);

			expect(calls).toEqual([1, 2]);
		});

		it("debounce restarts its wait for the nested call", async () => {
			const harness = createHarness();
			const calls: number[] = [];
			harness.bus.on(
				"t",
				debounceTask(100, (value: number, ctx) => {
					calls.push(value);
					if (value === 1) {
						ctx.emit("t", 2);
					}
				}),
			);
			harness.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(100);
			expect(calls).toEqual([1]);
			await vi.advanceTimersByTimeAsync(100);

			expect(calls).toEqual([1, 2]);
		});
	});

	describe("chained policies: no double trigger (patronum #249, #262)", () => {
		const burst = (harness: ReturnType<typeof createHarness>) => {
			for (let index = 1; index <= 5; index++) {
				harness.bus.emit("t", index);
			}
		};

		it("debounce after throttle calls fn once, with the last payload", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("t", debounceTask(50, throttleTask(100, handler)));
			burst(harness);
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([5]);
		});

		it("throttle after debounce calls fn for the leading and the trailing call, once each", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("t", throttleTask(100, debounceTask(50, handler)));
			burst(harness);
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 5]);
		});

		it("debounce inside debounce calls fn once", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("t", debounceTask(50, debounceTask(50, handler)));
			burst(harness);
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([5]);
		});

		it("latest over debounce calls fn once", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("t", latestTask(debounceTask(50, handler)));
			burst(harness);
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([5]);
		});

		it("two chains on the same event each fire once", async () => {
			const harness = createHarness();
			const first = vi.fn();
			const second = vi.fn();
			harness.bus.on("t", debounceTask(50, first));
			harness.bus.on("t", debounceTask(50, second));
			burst(harness);
			await vi.advanceTimersByTimeAsync(1000);

			expect(first).toHaveBeenCalledTimes(1);
			expect(second).toHaveBeenCalledTimes(1);
		});

		it("the same policy instance on a chain of events keeps one state", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const shared = debounceTask(50, handler);
			harness.bus.on("t", shared);
			harness.bus.on("t", shared);
			burst(harness);
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("throttle edges (patronum #283)", () => {
		it("a call made after a quiet window runs at once, as the patronum reviewer expects", async () => {
			const harness = createHarness();
			const calls: number[] = [];
			harness.bus.on(
				"t",
				throttleTask(100, (value: number) => calls.push(value)),
			);
			harness.bus.emit("t", 1);
			harness.bus.emit("t", 2);
			harness.bus.emit("t", 3);
			await vi.advanceTimersByTimeAsync(110);
			expect(calls).toEqual([1, 3]);
			harness.bus.emit("t", 4);

			expect(calls).toEqual([1, 3, 4]);
		});

		it("a call after a window with no calls is immediate", async () => {
			const harness = createHarness();
			const calls: number[] = [];
			harness.bus.on(
				"t",
				throttleTask(100, (value: number) => calls.push(value)),
			);
			harness.bus.emit("t", 1);
			harness.bus.emit("t", 2);
			await vi.advanceTimersByTimeAsync(250);
			harness.bus.emit("t", 3);

			expect(calls).toEqual([1, 2, 3]);
		});

		it("a lone call fires once, with no trailing repeat", async () => {
			const harness = createHarness();
			const calls: number[] = [];
			harness.bus.on(
				"t",
				throttleTask(100, (value: number) => calls.push(value)),
			);
			harness.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(1000);

			expect(calls).toEqual([1]);
		});
	});

	describe("poll stops for good (patronum #237)", () => {
		it("does not tick when the task aborts just before a tick is due", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			poll(controller, handler, 100);
			await vi.advanceTimersByTimeAsync(99);
			controller.abort();
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("does not tick again after a tick that aborted its own task", async () => {
			const controller = new AbortController();
			const handler = vi.fn((tick: number) => {
				if (tick === 1) {
					controller.abort();
				}
			});
			const done = poll(controller, handler, 100);
			await vi.advanceTimersByTimeAsync(1000);

			await expect(done).resolves.toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(2);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("a new poll works after the previous one stopped", async () => {
			const first = new AbortController();
			const second = new AbortController();
			const handler = vi.fn();
			poll(first, handler, 100);
			await vi.advanceTimersByTimeAsync(150);
			first.abort();
			poll(second, handler, 100);
			await vi.advanceTimersByTimeAsync(150);
			second.abort();

			expect(handler).toHaveBeenCalledTimes(2);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("two polls on different tasks do not stop each other", async () => {
			const first = new AbortController();
			const second = new AbortController();
			const firstHandler = vi.fn();
			const secondHandler = vi.fn();
			poll(first, firstHandler, 100);
			poll(second, secondHandler, 100);
			first.abort();
			await vi.advanceTimersByTimeAsync(250);
			second.abort();

			expect(firstHandler).not.toHaveBeenCalled();
			expect(secondHandler).toHaveBeenCalledTimes(2);
		});
	});
});
