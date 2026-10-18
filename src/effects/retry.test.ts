import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, deferred } from "../test-helpers";
import { retry } from "./retry";

const failing = (message = "boom") =>
	vi.fn((_attempt: number) => {
		throw new Error(message);
	});

describe("retry", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("attempts", () => {
		it("returns the value of the first success without retrying", async () => {
			const fn = vi.fn(() => 1);

			await expect(retry({}, fn)).resolves.toBe(1);
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("passes the attempt number, starting at 1", async () => {
			const fn = failing();
			await retry({}, fn).catch(() => {});

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
		});

		it("retries until it succeeds", async () => {
			const fn = vi.fn((attempt: number) => {
				if (attempt < 3) {
					throw new Error("not yet");
				}
				return "ok";
			});

			await expect(retry({}, fn)).resolves.toBe("ok");
			expect(fn).toHaveBeenCalledTimes(3);
		});

		it("retries after an async failure", async () => {
			const fn = vi.fn(async (attempt: number) => {
				if (attempt === 1) {
					throw new Error("not yet");
				}
				return "ok";
			});

			await expect(retry({}, fn)).resolves.toBe("ok");
			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("throws the last error after 3 attempts by default", async () => {
			const fn = vi.fn((attempt: number) => {
				throw new Error(`fail ${attempt}`);
			});

			await expect(retry({}, fn)).rejects.toThrow("fail 3");
			expect(fn).toHaveBeenCalledTimes(3);
		});

		it("honours times", async () => {
			const fn = failing();
			await retry({}, fn, { times: 5 }).catch(() => {});

			expect(fn).toHaveBeenCalledTimes(5);
		});

		it("does not retry with times 1", async () => {
			const fn = failing();

			await expect(retry({}, fn, { times: 1 })).rejects.toThrow("boom");
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("still calls fn once with times 0", async () => {
			const fn = failing();
			await retry({}, fn, { times: 0 }).catch(() => {});

			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("retries without timers when delay is 0", async () => {
			const fn = failing();
			await retry({}, fn, { times: 4 }).catch(() => {});

			expect(fn).toHaveBeenCalledTimes(4);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("accepts an object with a signal as the context", async () => {
			const controller = new AbortController();

			await expect(retry(controller, () => 1)).resolves.toBe(1);
		});
	});

	describe("delay", () => {
		it("waits the given number of ms between attempts", async () => {
			const fn = failing();
			const promise = retry({}, fn, { times: 3, delay: 100 });
			const assertion = expect(promise).rejects.toThrow("boom");
			expect(fn).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(99);
			expect(fn).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(fn).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(100);
			expect(fn).toHaveBeenCalledTimes(3);

			await assertion;
		});

		it("does not wait after the last attempt", async () => {
			const fn = failing();
			const promise = retry({}, fn, { times: 2, delay: 1000 });
			const assertion = expect(promise).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(1000);

			await assertion;
			expect(vi.getTimerCount()).toBe(0);
		});

		it("asks a delay function with the failed attempt and its error", async () => {
			const errors = [new Error("one"), new Error("two")];
			const fn = vi.fn((attempt: number) => {
				throw errors[attempt - 1] ?? new Error("last");
			});
			const wait = vi.fn((attempt: number) => attempt * 10);
			const promise = retry({}, fn, { times: 3, delay: wait });
			const assertion = expect(promise).rejects.toThrow("last");
			await vi.advanceTimersByTimeAsync(100);
			await assertion;

			expect(wait.mock.calls).toEqual([
				[1, errors[0]],
				[2, errors[1]],
			]);
		});

		it("supports an exponential backoff", async () => {
			const times: number[] = [];
			const start = Date.now();
			const fn = vi.fn(() => {
				times.push(Date.now() - start);
				throw new Error("boom");
			});
			const promise = retry({}, fn, {
				times: 4,
				delay: (attempt) => 2 ** attempt * 10,
			});
			const assertion = expect(promise).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(1000);
			await assertion;

			expect(times).toEqual([0, 20, 60, 140]);
		});
	});

	describe("shouldRetry", () => {
		it("stops and throws that error when it returns false", async () => {
			const fn = failing("fatal");
			const shouldRetry = vi.fn(() => false);

			await expect(retry({}, fn, { shouldRetry })).rejects.toThrow("fatal");
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("gets the error and the attempt number", async () => {
			const error = new Error("boom");
			const fn = vi.fn(() => {
				throw error;
			});
			const shouldRetry = vi.fn(() => true);
			await retry({}, fn, { times: 2, shouldRetry }).catch(() => {});

			expect(shouldRetry).toHaveBeenCalledTimes(1);
			expect(shouldRetry).toHaveBeenCalledWith(error, 1);
		});

		it("retries only the errors it accepts", async () => {
			const fn = vi.fn((attempt: number) => {
				throw new Error(attempt === 1 ? "transient" : "fatal");
			});

			await expect(
				retry({}, fn, {
					times: 5,
					shouldRetry: (error) => (error as Error).message === "transient",
				}),
			).rejects.toThrow("fatal");
			expect(fn).toHaveBeenCalledTimes(2);
		});
	});

	describe("abort", () => {
		it("rejects at once if already aborted, without calling fn", async () => {
			const controller = new AbortController();
			controller.abort("early");
			const fn = vi.fn();

			await expect(retry(controller, fn)).rejects.toBe("early");
			expect(fn).not.toHaveBeenCalled();
		});

		it("stops during a delay and clears the timer", async () => {
			const controller = new AbortController();
			const fn = failing();
			const promise = retry(controller, fn, { times: 5, delay: 100 });
			const assertion = expect(promise).rejects.toBe("stop");
			await vi.advanceTimersByTimeAsync(50);
			controller.abort("stop");
			await vi.advanceTimersByTimeAsync(1000);

			await assertion;
			expect(fn).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("does not retry when an attempt fails because of the abort", async () => {
			const controller = new AbortController();
			const fn = vi.fn(
				() =>
					new Promise((_resolve, reject) => {
						controller.signal.addEventListener("abort", () =>
							reject(new Error("aborted fetch")),
						);
					}),
			);
			const promise = retry(controller, fn, { times: 5 });
			const assertion = expect(promise).rejects.toBe("stop");
			controller.abort("stop");

			await assertion;
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("rejects at once even if the attempt ignores the abort", async () => {
			const controller = new AbortController();
			const d = deferred();
			const promise = retry(controller, () => d.promise);
			const assertion = expect(promise).rejects.toBe("stop");
			controller.abort("stop");

			await assertion;
			d.resolve();
		});
	});

	describe("trace", () => {
		it("a success on the first attempt", async () => {
			const h = createHarness();
			await retry(h.ctx(), () => 1);

			expect(h.phases()).toEqual([
				"retry/start",
				"run/start",
				"run/done",
				"retry/done",
			]);
		});

		it("traces every attempt, then done", async () => {
			const h = createHarness();
			await retry(h.ctx(), (attempt) => {
				if (attempt === 1) {
					throw new Error("boom");
				}
			});

			expect(h.phases()).toEqual([
				"retry/start",
				"run/start",
				"run/error",
				"run/start",
				"run/done",
				"retry/done",
			]);
		});

		it("ends with error when the attempts run out", async () => {
			const h = createHarness();
			await retry(h.ctx(), failing(), { times: 2 }).catch(() => {});

			expect(h.phases()).toEqual([
				"retry/start",
				"run/start",
				"run/error",
				"run/start",
				"run/error",
				"retry/error",
			]);
		});

		it("makes attempts children of the group", async () => {
			const h = createHarness();
			await retry(h.ctx(), () => 1);
			const group = h.recorder.events.find((e) => e.effect === "retry");
			const run = h.recorder.events.find((e) => e.effect === "run");

			expect(run?.parent).toBe(group?.id);
		});

		it("ends with cancel when the task aborts", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const promise = retry(ctx, () => new Promise(() => {})).catch(() => {});
			ctx.abort();
			await promise;
			const phases = h.phases();

			expect(phases).toContain("retry/cancel");
			expect(phases).toContain("run/cancel");
			expect(phases).not.toContain("retry/error");
		});
	});
});
