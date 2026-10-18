// Tricky cases taken from issues of other libraries, run against our policies.
//
// lodash: #2403, #4400, #4815, #4700, #4449, #3421, #2229, #608, #1470
// RxJS:   #2727, #7040, #5653, #3183, #5574
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { Task } from "../core/types";
import {
	type DebounceOptions,
	debounce,
	latest,
	leading,
	queue,
	type ThrottleOptions,
	throttle,
} from "../policies";
import { createHarness, deferred, type TestEvents } from "./test-helpers";

const throttleTask = <P, R>(
	ms: number,
	handler: Task<P, TestEvents, R>,
	options?: ThrottleOptions<P>,
) => throttle(ms, handler, options);
const latestTask = <P, R>(handler: Task<P, TestEvents, R>) => latest(handler);
const debounceTask = <P, R>(
	ms: number,
	handler: Task<P, TestEvents, R>,
	options?: DebounceOptions<P>,
) => debounce(ms, handler, options);

describe("regressions: timing", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("lodash #2403: one throttle shared by many elements", () => {
		type Scroll = { element: string; top: number };
		const scrollOf = (element: string, top: number): Scroll => ({
			element,
			top,
		});

		it("without a key a call from one element holds back the others", () => {
			const harness = createHarness();
			const fired: string[] = [];
			const throttled = throttleTask(100, (scroll: Scroll) =>
				fired.push(scroll.element),
			);
			throttled(scrollOf("A", 1), harness.ctx());
			throttled(scrollOf("B", 1), harness.ctx());
			throttled(scrollOf("C", 1), harness.ctx());

			expect(fired).toEqual(["A"]);
		});

		it("with a key every element is throttled on its own", () => {
			const harness = createHarness();
			const fired: string[] = [];
			const throttled = throttleTask(
				100,
				(scroll: Scroll) => fired.push(scroll.element),
				{
					key: (scroll) => scroll.element,
				},
			);
			throttled(scrollOf("A", 1), harness.ctx());
			throttled(scrollOf("B", 1), harness.ctx());
			throttled(scrollOf("C", 1), harness.ctx());
			throttled(scrollOf("D", 1), harness.ctx());

			expect(fired).toEqual(["A", "B", "C", "D"]);
		});

		it("with a key the second call of an element still waits", async () => {
			const harness = createHarness();
			const fired: string[] = [];
			const throttled = throttleTask(
				100,
				(scroll: Scroll) => fired.push(`${scroll.element}${scroll.top}`),
				{
					key: (scroll) => scroll.element,
				},
			);
			throttled(scrollOf("A", 1), harness.ctx());
			throttled(scrollOf("B", 1), harness.ctx());
			throttled(scrollOf("A", 2), harness.ctx());
			throttled(scrollOf("B", 2), harness.ctx());
			expect(fired).toEqual(["A1", "B1"]);
			await vi.advanceTimersByTimeAsync(100);

			expect(fired).toEqual(["A1", "B1", "A2", "B2"]);
		});

		it("with a key every element is debounced on its own", async () => {
			const harness = createHarness();
			const fired: string[] = [];
			const debounced = debounceTask(
				100,
				(scroll: Scroll) => fired.push(`${scroll.element}${scroll.top}`),
				{
					key: (scroll) => scroll.element,
				},
			);
			debounced(scrollOf("A", 1), harness.ctx());
			await vi.advanceTimersByTimeAsync(60);
			debounced(scrollOf("B", 1), harness.ctx());
			await vi.advanceTimersByTimeAsync(30);
			debounced(scrollOf("A", 2), harness.ctx());
			await vi.advanceTimersByTimeAsync(500);

			expect(fired).toEqual(["B1", "A2"]);
		});

		it("the key can be a computed value, not only a field", () => {
			const harness = createHarness();
			const fired: number[] = [];
			const throttled = throttleTask(
				100,
				(value: number) => fired.push(value),
				{ key: (value) => value % 2 },
			);
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			throttled(3, harness.ctx());
			throttled(4, harness.ctx());

			expect(fired).toEqual([1, 2]);
		});
	});

	describe("lodash #4400, #4815, #4700: what a debounced call returns", () => {
		it("every call returns a promise, also the first ones", () => {
			const harness = createHarness();
			const debounced = debounceTask(1000, async (value: number) => value);

			expect(debounced(1, harness.ctx())).toBeInstanceOf(Promise);
			expect(debounced(2, harness.ctx())).toBeInstanceOf(Promise);
			expect(debounced(3, harness.ctx())).toBeInstanceOf(Promise);
		});

		it("a caller gets the result of its own run, not of a later one", async () => {
			const harness = createHarness();
			const debounced = debounceTask(1000, async (value: number) => value * 10);
			const first = debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(1500);
			const second = debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(1500);
			const third = debounced(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(1500);

			await expect(first).resolves.toBe(10);
			await expect(second).resolves.toBe(20);
			await expect(third).resolves.toBe(30);
		});

		it("a call that was replaced resolves with undefined, never with the result of the call that replaced it", async () => {
			const harness = createHarness();
			const debounced = debounceTask(1000, async (value: number) => value * 10);
			const first = debounced(1, harness.ctx());
			const second = debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(1500);

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe(20);
		});

		it("awaiting a debounced call that never ran does not hang forever", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const debounced = debounceTask(1000, async (value: number) => value);
			const pending = debounced(1, ctx);
			ctx.abort();

			await expect(pending).resolves.toBeUndefined();
		});

		it("an async result is awaited, not wrapped twice", async () => {
			const harness = createHarness();
			const debounced = debounceTask(10, async (value2: number) => ({
				value: value2,
			}));
			const result = debounced(7, harness.ctx());
			await vi.advanceTimersByTimeAsync(10);

			await expect(result).resolves.toEqual({ value: 7 });
		});
	});

	describe("lodash #4449: errors of async functions", () => {
		it("a debounced async error reaches the caller whose run failed", async () => {
			const harness = createHarness();
			const debounced = debounceTask(100, async () => {
				throw new Error("boom");
			});
			const pending = debounced(1, harness.ctx());
			const assertion = expect(pending).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		});

		it("the error does not reach callers whose run was replaced", async () => {
			const harness = createHarness();
			const debounced = debounceTask(100, async (value: number) => {
				throw new Error(`boom ${value}`);
			});
			const first = debounced(1, harness.ctx());
			const second = debounced(2, harness.ctx());
			const assertion = expect(second).rejects.toThrow("boom 2");
			await vi.advanceTimersByTimeAsync(100);

			await expect(first).resolves.toBeUndefined();
			await assertion;
		});

		it("a trailing throttled async error reaches the held caller", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, async (value: number) => {
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

		it("a leading async error reaches the caller at once", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, async () => {
				throw new Error("boom");
			});

			await expect(throttled(1, harness.ctx())).rejects.toThrow("boom");
		});
	});

	describe("lodash #3421: a timer that keeps the process alive", () => {
		it("throttle with trailing: false leaves no timer once the call is done", async () => {
			const harness = createHarness();
			const throttled = throttleTask(10_000, () => 1, { trailing: false });
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			throttled(3, harness.ctx());

			expect(vi.getTimerCount()).toBe(0);
		});

		it("debounce with leading only leaves no timer", () => {
			const harness = createHarness();
			const debounced = debounceTask(10_000, () => 1, {
				leading: true,
				trailing: false,
			});
			debounced(1, harness.ctx());
			debounced(2, harness.ctx());

			expect(vi.getTimerCount()).toBe(0);
		});

		it("throttle with trailing: false still spaces the runs", async () => {
			const harness = createHarness();
			const fired: number[] = [];
			const throttled = throttleTask(
				100,
				(value: number) => fired.push(value),
				{ trailing: false },
			);
			throttled(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(40);
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(40);
			throttled(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(40);
			throttled(4, harness.ctx());

			expect(fired).toEqual([1, 4]);
		});

		it("debounce with leading only still treats a burst as one", async () => {
			const harness = createHarness();
			const fired: number[] = [];
			const debounced = debounceTask(
				100,
				(value: number) => fired.push(value),
				{
					leading: true,
					trailing: false,
				},
			);
			debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(60);
			debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(60);
			debounced(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			debounced(4, harness.ctx());

			expect(fired).toEqual([1, 4]);
		});

		it("a pending trailing call keeps a timer, which is cleared when it runs", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, () => 1);
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			expect(vi.getTimerCount()).toBeGreaterThan(0);
			await vi.advanceTimersByTimeAsync(100);
			await vi.advanceTimersByTimeAsync(100);

			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("lodash #2229: calls after a forced run are not dropped", () => {
		it("calls made after the run at the end of a window get their own trailing run", async () => {
			const harness = createHarness();
			const fired: number[] = [];
			const throttled = throttleTask(100, (value: number) => fired.push(value));
			throttled(0, harness.ctx());
			await vi.advanceTimersByTimeAsync(40);
			throttled(40, harness.ctx());
			await vi.advanceTimersByTimeAsync(40);
			throttled(80, harness.ctx());
			await vi.advanceTimersByTimeAsync(25);
			expect(fired).toEqual([0, 80]);
			throttled(105, harness.ctx());
			await vi.advanceTimersByTimeAsync(5);
			throttled(110, harness.ctx());
			await vi.advanceTimersByTimeAsync(200);

			expect(fired).toEqual([0, 80, 110]);
		});

		it("debounce keeps a call made right after a run", async () => {
			const harness = createHarness();
			const fired: number[] = [];
			const debounced = debounceTask(100, (value: number) => fired.push(value));
			debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			debounced(2, harness.ctx());
			debounced(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(fired).toEqual([1, 3]);
		});
	});

	describe("lodash #608: no stale value", () => {
		it("a throttled call that does not run returns nothing, not the last result", () => {
			const harness = createHarness();
			const throttled = throttleTask(100, (value: number) => value, {
				trailing: false,
			});
			expect(throttled(1, harness.ctx())).toBe(1);

			expect(throttled(2, harness.ctx())).toBeUndefined();
		});

		it("a held call resolves with its own result", async () => {
			const harness = createHarness();
			const throttled = throttleTask(100, (value: number) => value * 2);
			throttled(1, harness.ctx());
			const held = throttled(5, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(held).resolves.toBe(10);
		});
	});

	describe("lodash #1470: cancelling a pending call", () => {
		it("aborting the task of the pending debounced call cancels it", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const ctx = harness.ctx();
			debounceTask(100, handler)(1, ctx);
			ctx.abort();
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("aborting the task of the pending throttled call cancels it", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const throttled = throttleTask(100, handler);
			throttled(1, harness.ctx());
			const ctx = harness.ctx();
			throttled(2, ctx);
			ctx.abort();
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("aborting a call that is not the pending one leaves the pending one alone", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const throttled = throttleTask(100, handler);
			const first = harness.ctx();
			throttled(1, first);
			throttled(2, harness.ctx());
			first.abort();
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);
		});
	});

	describe("RxJS #2727: leading and trailing give two outputs per boundary", () => {
		it("a steady stream gives one run per window, never a pair", async () => {
			const harness = createHarness();
			const times: number[] = [];
			const start = Date.now();
			const throttled = throttleTask(250, () => times.push(Date.now() - start));
			for (let index = 0; index < 40; index++) {
				throttled(index, harness.ctx());
				await vi.advanceTimersByTimeAsync(50);
			}
			await vi.advanceTimersByTimeAsync(1000);
			const gaps = times
				.slice(1)
				.map((time, index) => time - (times[index] ?? 0));

			expect(times.length).toBeGreaterThan(5);
			expect(Math.min(...gaps)).toBeGreaterThanOrEqual(250);
		});

		it("the same holds for random steady streams", async () => {
			for (let seed = 1; seed <= 30; seed++) {
				const harness = createHarness();
				const times: number[] = [];
				const start = Date.now();
				const ms = 100 + seed * 7;
				const throttled = throttleTask(ms, () =>
					times.push(Date.now() - start),
				);
				let random = seed;
				for (let index = 0; index < 40; index++) {
					throttled(index, harness.ctx());
					random = (random * 1103515245 + 12345) & 0x7fffffff;
					await vi.advanceTimersByTimeAsync(1 + (random % Math.floor(ms / 2)));
				}
				await vi.advanceTimersByTimeAsync(ms * 3);
				const gaps = times
					.slice(1)
					.map((time, index) => time - (times[index] ?? 0));

				expect(Math.min(...gaps), `seed ${seed}`).toBeGreaterThanOrEqual(ms);
			}
		});
	});

	describe("RxJS #7040: emitting from inside the handler must not run away", () => {
		it("throttle: a handler that emits itself on every run runs once per window", async () => {
			const harness = createHarness();
			const runs: number[] = [];
			harness.bus.on(
				"t",
				throttleTask(100, (value: number, ctx) => {
					runs.push(value);
					ctx.emit("t", value + 1);
					ctx.emit("t", value + 1);
				}),
			);
			harness.bus.emit("t", 0);
			await vi.advanceTimersByTimeAsync(450);

			expect(runs.length).toBeLessThanOrEqual(6);
			expect(runs.length).toBeGreaterThanOrEqual(4);
		});

		it("debounce: a handler that emits itself runs once per quiet period", async () => {
			const harness = createHarness();
			const runs: number[] = [];
			harness.bus.on(
				"t",
				debounceTask(100, (value: number, ctx) => {
					runs.push(value);
					if (value < 100) {
						ctx.emit("t", value + 1);
					}
				}),
			);
			harness.bus.emit("t", 0);
			await vi.advanceTimersByTimeAsync(450);

			expect(runs.length).toBeLessThanOrEqual(5);
			expect(runs.length).toBeGreaterThanOrEqual(3);
		});

		it("leading: a handler that emits itself is not run again while it runs", () => {
			const harness = createHarness();
			const runs: number[] = [];
			harness.bus.on(
				"t",
				leading((value: number, ctx) => {
					runs.push(value);
					ctx.emit("t", value + 1);
					ctx.emit("t", value + 1);
				}),
			);
			harness.bus.emit("t", 0);

			expect(runs).toEqual([0]);
		});

		it("latest: the nested emit supersedes the outer run, and the loop stops at the guard", () => {
			const harness = createHarness();
			const runs: number[] = [];
			harness.bus.on(
				"t",
				latest((value: number, ctx) => {
					runs.push(value);
					if (value < 5) {
						ctx.emit("t", value + 1);
					}
				}),
			);
			harness.bus.emit("t", 0);

			expect(runs).toEqual([0, 1, 2, 3, 4, 5]);
		});
	});

	describe("RxJS #5653: many synchronous attempts must not overflow the stack", () => {
		it("a policy handles very many synchronous calls", async () => {
			const harness = createHarness();
			let count = 0;
			const latestEffect = latest<number, TestEvents, void>(() => {
				count++;
			});
			const leadingTask = leading<number, TestEvents, void>(() => {
				count++;
			});
			const throttled = throttleTask(100, (_: number) => {
				count++;
			});
			const ctx = harness.ctx();
			for (let index = 0; index < 20_000; index++) {
				latestEffect(index, ctx);
				leadingTask(index, ctx);
				throttled(index, ctx);
			}
			await vi.advanceTimersByTimeAsync(200);

			expect(count).toBeGreaterThan(20_000);
		});

		it("a queue runs very many synchronous tasks without growing the stack", async () => {
			vi.useRealTimers();
			const harness = createHarness();
			let done = 0;
			const queued = queue<number, TestEvents, void>(() => {
				done++;
			});
			const calls: Array<Promise<unknown>> = [];
			for (let index = 0; index < 30_000; index++) {
				calls.push(queued(index, harness.ctx()));
			}
			await Promise.all(calls);

			expect(done).toBe(30_000);
		});
	});

	describe("RxJS #3183: errors trapped by switching operators", () => {
		it("the error of the current async run reaches the caller", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const latestEffect = latestTask((value: number) =>
				value === 1 ? gate.promise : Promise.reject(new Error("final error")),
			);
			latestEffect(1, harness.ctx());
			const current = latestEffect(2, harness.ctx());
			gate.resolve("stale");

			await expect(current).rejects.toThrow("final error");
		});

		it("the error of a replaced run is swallowed", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const latestEffect = latestTask((value: number) =>
				value === 1 ? gate.promise : "ok",
			);
			const replaced = latestEffect(1, harness.ctx());
			latestEffect(2, harness.ctx());
			gate.reject(new Error("too late"));

			await expect(replaced).resolves.toBeUndefined();
		});

		it("an async error of a handler wrapped in a policy reaches onError", async () => {
			vi.useRealTimers();
			const onError = vi.fn();
			const bus = createBus<TestEvents>({ onError });
			bus.on(
				"t",
				latest(async (value: number) => {
					await Promise.resolve();
					throw new Error(`boom ${value}`);
				}),
			);
			bus.emit("t", 1);
			await new Promise((result) => setTimeout(result, 5));

			expect(onError).toHaveBeenCalledTimes(1);
		});
	});

	describe("RxJS #5574: spacing after a quiet gap", () => {
		it("a call after a quiet window runs at once even if the last run was recent", async () => {
			const harness = createHarness();
			const fired: number[] = [];
			const throttled = throttleTask(100, (value: number) => fired.push(value));
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			throttled(3, harness.ctx());

			expect(fired).toEqual([1, 2, 3]);
		});

		it("with steady calls the runs are spaced by the window", async () => {
			const harness = createHarness();
			const times: number[] = [];
			const start = Date.now();
			const throttled = throttleTask(100, () => times.push(Date.now() - start));
			for (let index = 0; index < 12; index++) {
				throttled(index, harness.ctx());
				await vi.advanceTimersByTimeAsync(30);
			}
			await vi.advanceTimersByTimeAsync(300);
			const gaps = times
				.slice(1)
				.map((time, index) => time - (times[index] ?? 0));

			expect(Math.min(...gaps)).toBeGreaterThanOrEqual(100);
		});
	});
});
