import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBus, type WithContext } from "../core/bus";
import type { Task } from "../core/types";
import { latest } from "../policies";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { type RetryOptions, retry } from "./retry";

// the Task form is typed for the events of the bus it goes to; the tests pin them
const retryOf = <R>(
	task: Task<number, TestEvents, R>,
	options?: RetryOptions,
) => retry<number, TestEvents, R>(task, options);

const failing = (message = "boom") =>
	vi.fn((_payload: number, _ctx: unknown) => {
		throw new Error(message);
	});

describe("retry as a Task", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("attempts", () => {
		it("does not call the Task until it is run", () => {
			const task = vi.fn((value: number) => value);
			retryOf(task);

			expect(task).not.toHaveBeenCalled();
		});

		it("calls the Task with the payload and a context, and returns its result", async () => {
			const harness = createHarness();
			const task = vi.fn(
				(value: number, _ctx: { signal: AbortSignal }) => value * 2,
			);

			await expect(retryOf(task)(21, harness.ctx())).resolves.toBe(42);
			expect(task).toHaveBeenCalledTimes(1);
			expect(task.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
		});

		it("retries up to times, the first call included, and throws the last error", async () => {
			const harness = createHarness();
			const task = failing();

			await expect(
				retryOf(task, { times: 4 })(1, harness.ctx()),
			).rejects.toThrow("boom");
			expect(task).toHaveBeenCalledTimes(4);
		});

		it("is 3 attempts by default", async () => {
			const harness = createHarness();
			const task = failing();
			await retryOf(task)(1, harness.ctx()).catch(() => {});

			expect(task).toHaveBeenCalledTimes(3);
		});

		it("retries until it succeeds, after an async failure too", async () => {
			const harness = createHarness();
			let calls = 0;
			const task = async (value: number) => {
				calls++;
				if (calls < 3) {
					throw new Error("not yet");
				}
				return value;
			};

			await expect(retryOf(task)(7, harness.ctx())).resolves.toBe(7);
			expect(calls).toBe(3);
		});

		it("shouldRetry can stop it, and gets the error and the attempt", async () => {
			const harness = createHarness();
			const task = failing("fatal");
			const shouldRetry = vi.fn(() => false);

			await expect(
				retryOf(task, { shouldRetry })(1, harness.ctx()),
			).rejects.toThrow("fatal");
			expect(task).toHaveBeenCalledTimes(1);
			expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
		});

		it("waits for delay between the attempts", async () => {
			const harness = createHarness();
			const task = failing();
			const done = retryOf(task, { times: 3, delay: 100 })(
				1,
				harness.ctx(),
			).catch(() => {});
			await vi.advanceTimersByTimeAsync(99);
			expect(task).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(task).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(100);
			await done;

			expect(task).toHaveBeenCalledTimes(3);
		});

		it("behaves as the ctx form for the same options", async () => {
			const harness = createHarness();
			const viaTask = failing();
			const viaCtx = vi.fn((_attempt: number) => {
				throw new Error("boom");
			});
			const options = {
				times: 5,
				shouldRetry: (_: unknown, attempt: number) => attempt < 4,
			};
			await retryOf(viaTask, options)(1, harness.ctx()).catch(() => {});
			await retry(harness.ctx(), viaCtx, options).catch(() => {});

			expect(viaTask).toHaveBeenCalledTimes(viaCtx.mock.calls.length);
		});
	});

	describe("the context of an attempt", () => {
		it("is its own child context for each attempt", async () => {
			const harness = createHarness();
			const seen: unknown[] = [];
			const task = (_: number, ctx: unknown) => {
				seen.push(ctx);
				throw new Error("boom");
			};
			await retryOf(task, { times: 2 })(1, harness.ctx()).catch(() => {});

			expect(seen).toHaveLength(2);
			expect(seen[0]).not.toBe(seen[1]);
		});

		it("aborts with the caller: no further attempt, no delay", async () => {
			const harness = createHarness();
			const caller = harness.ctx();
			const task = failing();
			const done = retryOf(task, { times: 5, delay: 100 })(1, caller);
			const expectation = expect(done).rejects.toBeDefined();
			await vi.advanceTimersByTimeAsync(50);
			caller.abort("stop");
			await vi.advanceTimersByTimeAsync(1000);

			await expectation;
			expect(task).toHaveBeenCalledTimes(1);
		});

		it("an abort of the signal of one attempt does not abort the caller", async () => {
			const harness = createHarness();
			const caller = harness.ctx();
			let calls = 0;
			const task = (_: number, ctx: { abort: (reason?: unknown) => void }) => {
				calls++;
				if (calls === 1) {
					ctx.abort("this attempt only");
					throw new Error("first");
				}
				return "second";
			};

			await expect(retryOf(task)(1, caller)).resolves.toBe("second");
			expect(caller.signal.aborted).toBe(false);
		});

		it("has the fields of the bus context", async () => {
			type FieldEvents = TestEvents & WithContext<{ label: string }>;
			const bus = createBus<FieldEvents>({
				context: { label: "from the bus" },
			});
			const seen: string[] = [];
			bus.on(
				"t",
				retry((_value: number, ctx) => {
					seen.push(ctx.label);
				}),
			);
			bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(0);

			expect(seen).toEqual(["from the bus"]);
		});
	});

	describe("in a policy", () => {
		it("latest aborts the older attempt and no retry follows it", async () => {
			const bus = createBus<TestEvents>();
			const gates = [deferred<void>(), deferred<void>()];
			const started: number[] = [];
			const signals: AbortSignal[] = [];
			let call = 0;
			bus.on(
				"t",
				latest(
					retryOf(
						async (value: number, ctx) => {
							started.push(value);
							signals.push(ctx.signal);
							await gates[call++]?.promise;
							throw new Error("fail");
						},
						{ times: 3 },
					),
				),
			);
			bus.emit("t", 1);
			bus.emit("t", 2);
			gates[0]?.resolve();
			await vi.advanceTimersByTimeAsync(0);

			expect(signals[0]?.aborted).toBe(true);
			expect(started).toEqual([1, 2]);
		});
	});

	describe("trace", () => {
		it("has one retry group with a run child for each attempt", async () => {
			const harness = createHarness();
			let calls = 0;
			const task = async (value: number) => {
				calls++;
				if (calls === 1) {
					throw new Error("once");
				}
				return value;
			};
			await retryOf(task)(1, harness.ctx());
			const phases = harness
				.phases()
				.filter((phase) => /^(retry|run)\//.test(phase));

			expect(phases).toEqual([
				"retry/start",
				"run/start",
				"run/error",
				"run/start",
				"run/done",
				"retry/done",
			]);
		});
	});
});
