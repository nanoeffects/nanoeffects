import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createHarness,
	noPayload,
	type TestEvents,
} from "../tests/test-helpers";
import { all, delay, poll, race, retry, take, timeout } from ".";

describe("the Task of retry, timeout and poll as a starter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("retry", () => {
		it("retries inside a race and calls the function with an undefined payload", async () => {
			const harness = createHarness();
			const payloads: unknown[] = [];
			let calls = 0;
			const load = (payload: unknown) => {
				payloads.push(payload);
				calls++;
				if (calls < 3) {
					throw new Error("boom");
				}

				return "user";
			};
			const result = await race(harness.ctx(), {
				user: retry(load, { times: 3 }),
				waited: delay(5000),
			});

			expect(result).toEqual({ user: "user" });
			expect(calls).toBe(3);
			expect(payloads).toEqual([noPayload, noPayload, noPayload]);
		});

		it("aborts the attempt that waits when another starter wins", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const load = (_payload: unknown, ctx: { signal: AbortSignal }) => {
				signals.push(ctx.signal);

				return new Promise<string>(() => {});
			};
			const promise = race(harness.ctx(), {
				user: retry(load),
				cancelled: take("b"),
			});
			await vi.advanceTimersByTimeAsync(0);
			harness.bus.emit("b", "stop");

			await expect(promise).resolves.toEqual({ cancelled: "stop" });
			expect(signals).toHaveLength(1);
			expect(signals[0]?.aborted).toBe(true);
		});

		it("starts no further attempt when another starter wins during the pause", async () => {
			const harness = createHarness();
			const load = vi.fn((_payload: unknown) => {
				throw new Error("boom");
			});
			const promise = race(harness.ctx(), {
				user: retry(load, { times: 5, delay: 1000 }),
				cancelled: take("b"),
			});
			await vi.advanceTimersByTimeAsync(0);
			harness.bus.emit("b", "stop");
			await expect(promise).resolves.toEqual({ cancelled: "stop" });
			await vi.advanceTimersByTimeAsync(5000);

			expect(load).toHaveBeenCalledTimes(1);
		});
	});

	describe("timeout", () => {
		it("rejects with a TimeoutError and aborts the function", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const load = (_payload: unknown, ctx: { signal: AbortSignal }) => {
				signals.push(ctx.signal);

				return new Promise<string>(() => {});
			};
			const promise = all(harness.ctx(), { page: timeout(100, load) });
			const assertion = expect(promise).rejects.toMatchObject({
				name: "TimeoutError",
			});
			await vi.advanceTimersByTimeAsync(100);
			await assertion;

			expect(signals[0]?.aborted).toBe(true);
		});

		it("gives the result of a function that is in time", async () => {
			const harness = createHarness();
			const result = await all(harness.ctx(), {
				page: timeout(100, () => "page"),
			});

			expect(result).toEqual({ page: "page" });
		});
	});

	describe("poll", () => {
		it("polls until another starter wins and leaves no timer", async () => {
			const harness = createHarness();
			const refresh = vi.fn();
			const promise = race(harness.ctx(), {
				watching: poll(100, refresh),
				left: take("b"),
			});
			await vi.advanceTimersByTimeAsync(250);
			harness.bus.emit("b", "leave");

			await expect(promise).resolves.toEqual({ left: "leave" });
			expect(refresh).toHaveBeenCalledTimes(2);
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("the call with a payload and a context", () => {
		it("passes a payload that is itself a context to the function", async () => {
			const harness = createHarness();
			const seen: unknown[] = [];
			const task = retry<unknown, TestEvents, string>((payload) => {
				seen.push(payload);

				return "done";
			});
			const payload = { signal: new AbortController().signal };
			await task(payload, harness.ctx());

			expect(seen).toEqual([payload]);
		});
	});

	describe("a call with one argument that is not a context", () => {
		it("throws a TypeError, calls nothing and starts no timer", () => {
			const task = vi.fn();
			const retried = retry(task);
			const limited = timeout(100, task);
			const polled = poll(100, task);

			expect(() => (retried as (value: unknown) => unknown)("payload")).toThrow(
				TypeError,
			);
			expect(() => (limited as (value: unknown) => unknown)("payload")).toThrow(
				TypeError,
			);
			expect(() => (polled as (value: unknown) => unknown)("payload")).toThrow(
				TypeError,
			);
			expect(task).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});
	});
});
