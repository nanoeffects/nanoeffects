import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLifecycle, reportsLifecycle } from "../core/lifecycle-key";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { type RateLimitOptions, rateLimit } from "./rate-limit";
import { withPolicy } from "./with-policy";

// the events of the harness are pinned, so a context of the harness fits
const limited = <P, R>(
	limit: number,
	ms: number,
	handler: Task<P, TestEvents, R>,
	options?: RateLimitOptions<P>,
) => rateLimit(limit, ms, handler, options);

const lifecycle = () => ({
	start: vi.fn(),
	drop: vi.fn(),
	cancel: vi.fn(),
	done: vi.fn(),
});

describe("rateLimit", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("the window", () => {
		it("starts calls at once while the window has room", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(2, 1000, handler);
			task(1, harness.ctx());
			task(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("makes the call over the limit wait for the window", async () => {
			const harness = createHarness();
			const started: number[] = [];
			const task = limited(2, 1000, (value: number) => {
				started.push(Date.now());
				return value;
			});
			const origin = Date.now();
			const results = [1, 2, 3].map((value) => task(value, harness.ctx()));
			await vi.advanceTimersByTimeAsync(999);
			expect(started).toHaveLength(2);
			await vi.advanceTimersByTimeAsync(1);

			expect(started).toEqual([origin, origin, origin + 1000]);
			await expect(Promise.all(results)).resolves.toEqual([1, 2, 3]);
		});

		it("slides: the window frees a place when the oldest start leaves it", async () => {
			const harness = createHarness();
			const started: number[] = [];
			const task = limited(2, 1000, (value: number) => {
				started.push(Date.now());
				return value;
			});
			const origin = Date.now();
			task(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(600);
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			task(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(300);
			expect(started).toEqual([origin, origin + 600, origin + 1000]);
			await vi.advanceTimersByTimeAsync(600);
			task(4, harness.ctx());

			expect(started.at(-1)).toBe(origin + 1600);
		});

		it("starts waiting calls in the order of the calls", async () => {
			const harness = createHarness();
			const order: number[] = [];
			const task = limited(1, 100, (value: number) => {
				order.push(value);
			});
			for (const value of [1, 2, 3, 4]) {
				task(value, harness.ctx());
			}
			await vi.advanceTimersByTimeAsync(400);

			expect(order).toEqual([1, 2, 3, 4]);
		});

		it("never starts more than `limit` runs in any window", async () => {
			const harness = createHarness();
			const started: number[] = [];
			const task = limited(3, 100, () => {
				started.push(Date.now());
			});
			for (let index = 0; index < 20; index++) {
				task(index, harness.ctx());
				await vi.advanceTimersByTimeAsync(7);
			}
			await vi.advanceTimersByTimeAsync(1000);

			expect(started).toHaveLength(20);
			for (const [index, time] of started.entries()) {
				const inWindow = started.filter(
					(other, otherIndex) =>
						otherIndex <= index && other > time - 100 && other <= time,
				);
				expect(inWindow.length).toBeLessThanOrEqual(3);
			}
		});

		it("lets a call that arrives later start at once when the window is empty", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(1, 100, handler);
			task(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			task(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("does not wait for a run to settle, only for the window", async () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise<void>(() => {}));
			const task = limited(2, 1000, handler);
			task(1, harness.ctx());
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(1500);
			task(3, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(3);
		});

		it("rejects only the call of a run that failed, and goes on", async () => {
			const harness = createHarness();
			const failure = new Error("boom");
			const task = limited(1, 100, (value: number) => {
				if (value === 1) {
					throw failure;
				}
				return value;
			});
			const first = task(1, harness.ctx());
			const second = task(2, harness.ctx());
			first.catch(() => {});
			await vi.advanceTimersByTimeAsync(100);

			await expect(first).rejects.toBe(failure);
			await expect(second).resolves.toBe(2);
		});

		it("returns a promise with the value of the run for every call", async () => {
			const harness = createHarness();
			const task = limited(5, 100, (value: number) => value * 2);
			const result = task(2, harness.ctx());

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBe(4);
		});
	});

	describe("overflow", () => {
		it("drops a call over the limit with overflow drop", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(1, 1000, handler, { overflow: "drop" });
			const first = task(1, harness.ctx());
			const second = task(2, harness.ctx());

			await expect(first).resolves.toBe(1);
			await expect(second).resolves.toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("accepts calls again once the window moved, with overflow drop", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(1, 100, handler, { overflow: "drop" });
			task(1, harness.ctx());
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			task(3, harness.ctx());

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 3]);
		});

		it("keeps every call by default, with no cap", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(1, 10, handler);
			const results = Array.from({ length: 100 }, (_, index) =>
				task(index, harness.ctx()),
			);
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).toHaveBeenCalledTimes(100);
			await expect(Promise.all(results)).resolves.toHaveLength(100);
		});
	});

	describe("abort", () => {
		it("takes a waiting call out of the line and gives its turn to the next one", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(1, 100, handler);
			const secondCtx = harness.ctx();
			task(1, harness.ctx());
			const second = task(2, secondCtx);
			const third = task(3, harness.ctx());
			secondCtx.abort();
			await vi.advanceTimersByTimeAsync(100);

			await expect(second).resolves.toBeUndefined();
			await expect(third).resolves.toBe(3);
			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 3]);
		});

		it("does not start a call that is aborted already", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const ctx = harness.ctx();
			ctx.abort();

			await expect(limited(1, 100, handler)(1, ctx)).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("drops the result of a run whose task aborted, and keeps its start in the window", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const handler = vi.fn((value: number) =>
				value === 1 ? gate.promise : "next",
			);
			const task = limited(1, 100, handler);
			const ctx = harness.ctx();
			const first = task(1, ctx);
			ctx.abort();
			gate.resolve("late");
			const second = task(2, harness.ctx());

			await expect(first).resolves.toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(100);
			await expect(second).resolves.toBe("next");
		});

		it("leaves no timer when the only waiting call aborts", async () => {
			const harness = createHarness();
			const task = limited(1, 100, (value: number) => value);
			const ctx = harness.ctx();
			task(1, harness.ctx());
			task(2, ctx);
			await vi.advanceTimersByTimeAsync(0);
			ctx.abort();
			await vi.advanceTimersByTimeAsync(100);

			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("keys", () => {
		it("gives each key its own window", () => {
			const harness = createHarness();
			const handler = vi.fn((_value: string) => 1);
			const task = limited(1, 1000, handler, { key: (value) => value });
			task("a", harness.ctx());
			task("b", harness.ctx());
			task("a", harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("leaves no timer for a key whose window has emptied", async () => {
			const harness = createHarness();
			const task = limited(1, 100, (value: number) => value, {
				key: (value) => value,
			});
			for (let index = 0; index < 50; index++) {
				task(index, harness.ctx());
			}
			await vi.advanceTimersByTimeAsync(100);

			expect(vi.getTimerCount()).toBe(0);
		});

		it("uses one timer for a key, however many calls wait", () => {
			const harness = createHarness();
			const task = limited(1, 100, (value: number) => value);
			for (let index = 0; index < 20; index++) {
				task(index, harness.ctx());
			}

			expect(vi.getTimerCount()).toBe(1);
		});
	});

	describe("odd arguments", () => {
		it("takes a limit of 0, a negative one and NaN as 1", () => {
			for (const odd of [0, -3, Number.NaN]) {
				const harness = createHarness();
				const handler = vi.fn((value: number) => value);
				const task = limited(odd, 1000, handler);
				task(1, harness.ctx());
				task(2, harness.ctx());

				expect(handler).toHaveBeenCalledTimes(1);
			}
		});

		it("rounds a fractional limit down", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(2.9, 1000, handler);
			for (const value of [1, 2, 3]) {
				task(value, harness.ctx());
			}

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("limits nothing when ms is 0 or negative", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(1, 0, handler);
			task(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(0);
			task(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("never lets a waiting call start when ms is Infinity", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(1, Number.POSITIVE_INFINITY, handler);
			task(1, harness.ctx());
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(10 ** 9);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("handles a window longer than the timer of the platform allows", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const long = 2 ** 31 * 2;
			const task = limited(1, long, handler);
			task(1, harness.ctx());
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(long - 1);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("job lifecycle", () => {
		it("is marked as a policy that reports", () => {
			expect(
				Reflect.get(
					rateLimit(1, 10, () => 1),
					reportsLifecycle,
				),
			).toBe(true);
		});

		it("tells the job when the handler starts, not at the call", async () => {
			const harness = createHarness();
			const task = limited(1, 100, (value: number) => value);
			const first = lifecycle();
			const second = lifecycle();
			const firstCtx = harness.ctx();
			const secondCtx = harness.ctx();
			Reflect.set(firstCtx, callLifecycle, first);
			Reflect.set(secondCtx, callLifecycle, second);
			task(1, firstCtx);
			task(2, secondCtx);

			expect(first.start).toHaveBeenCalledTimes(1);
			expect(second.start).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(100);
			expect(second.start).toHaveBeenCalledTimes(1);
			expect(second.done).toHaveBeenCalledWith({ value: 2 });
		});

		it("drops a call that is dropped by overflow and one that aborts while it waits", () => {
			const harness = createHarness();
			const task = limited(1, 100, (value: number) => value);
			const waitingReport = lifecycle();
			const waitingCtx = harness.ctx();
			Reflect.set(waitingCtx, callLifecycle, waitingReport);
			task(1, harness.ctx());
			task(2, waitingCtx);
			waitingCtx.abort();

			expect(waitingReport.drop).toHaveBeenCalledTimes(1);
			expect(waitingReport.start).not.toHaveBeenCalled();

			const dropper = limited(1, 100, (value: number) => value, {
				overflow: "drop",
			});
			const droppedReport = lifecycle();
			const droppedCtx = harness.ctx();
			Reflect.set(droppedCtx, callLifecycle, droppedReport);
			dropper(1, harness.ctx());
			dropper(2, droppedCtx);

			expect(droppedReport.drop).toHaveBeenCalledTimes(1);
		});

		it("reports the error of a run as an outcome of that call", async () => {
			const harness = createHarness();
			const failure = new Error("boom");
			const task = limited(1, 100, () => {
				throw failure;
			});
			const report = lifecycle();
			const ctx = harness.ctx();
			Reflect.set(ctx, callLifecycle, report);
			await expect(task(1, ctx)).rejects.toBe(failure);

			expect(report.done).toHaveBeenCalledWith({ error: failure });
		});
	});

	describe("forms", () => {
		it("behaves the same in the wrapper form", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = rateLimit(1, 100)<number, TestEvents, number>(handler);
			task(1, harness.ctx());
			task(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(100);
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("takes a key in the wrapper form", () => {
			const harness = createHarness();
			const handler = vi.fn((_value: string) => 1);
			const task = rateLimit(1, 100, { key: (value: string) => value })<
				TestEvents,
				number
			>(handler);
			task("a", harness.ctx());
			task("b", harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("accepts null options as the defaults", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = limited(1, 100, handler, {
				key: null,
				overflow: null,
			} as never);
			task(1, harness.ctx());
			task(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("works as a plain function through withPolicy", async () => {
			const handler = vi.fn((value: number) => value);
			const call = withPolicy(rateLimit(1, 100, handler));
			const first = call(1);
			const second = call(2);

			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(100);
			await expect(first).resolves.toBe(1);
			await expect(second).resolves.toBe(2);
		});

		it("drops the waiting calls of withPolicy.cancel", async () => {
			const handler = vi.fn((value: number) => value);
			const call = withPolicy(rateLimit(1, 100, handler));
			call(1);
			const second = call(2);
			call.cancel();
			await vi.advanceTimersByTimeAsync(200);

			await expect(second).resolves.toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
		});
	});
});
