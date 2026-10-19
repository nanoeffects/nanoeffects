import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { retry } from "./retry";
import { timeout } from "./timeout";

// the Task form is typed for the events of the bus it goes to; the tests pin them
const timeoutOf = <R>(ms: number, task: Task<number, TestEvents, R>) =>
	timeout<number, TestEvents, R>(ms, task);

describe("timeout as a Task", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not call the Task until it is run", () => {
		const task = vi.fn((value: number) => value);
		timeoutOf(1000, task);

		expect(task).not.toHaveBeenCalled();
	});

	it("returns the result of a Task that is in time, and passes the payload", async () => {
		const harness = createHarness();
		const task = vi.fn(async (value: number) => value + 1);

		await expect(timeoutOf(1000, task)(41, harness.ctx())).resolves.toBe(42);
		expect(task.mock.calls[0]?.[0]).toBe(41);
	});

	it("rejects with a TimeoutError when the Task takes too long, and aborts its signal", async () => {
		const harness = createHarness();
		let signal: AbortSignal | null = null;
		const task = (_: number, ctx: { signal: AbortSignal }) => {
			signal = ctx.signal;
			return new Promise<never>(() => {});
		};
		const done = timeoutOf(100, task)(1, harness.ctx());
		const expectation = expect(done).rejects.toMatchObject({
			name: "TimeoutError",
		});
		await vi.advanceTimersByTimeAsync(100);

		await expectation;
		expect((signal as AbortSignal | null)?.aborted).toBe(true);
	});

	it("rejects even if the Task ignores its signal", async () => {
		const harness = createHarness();
		const gate = deferred<number>();
		const done = timeoutOf(50, () => gate.promise)(1, harness.ctx());
		const expectation = expect(done).rejects.toMatchObject({
			name: "TimeoutError",
		});
		await vi.advanceTimersByTimeAsync(50);

		await expectation;
	});

	it("does not abort the caller when the Task times out", async () => {
		const harness = createHarness();
		const caller = harness.ctx();
		const done = timeoutOf(10, () => new Promise<never>(() => {}))(
			1,
			caller,
		).catch(() => {});
		await vi.advanceTimersByTimeAsync(10);
		await done;

		expect(caller.signal.aborted).toBe(false);
	});

	it("rejects with the reason when the caller aborts, and leaves no timer", async () => {
		const harness = createHarness();
		const caller = harness.ctx();
		const done = timeoutOf(1000, () => new Promise<never>(() => {}))(1, caller);
		const expectation = expect(done).rejects.toBe("stop");
		caller.abort("stop");

		await expectation;
		expect(vi.getTimerCount()).toBe(0);
	});

	it("leaves no timer after a result in time", async () => {
		const harness = createHarness();
		await timeoutOf(1000, async (value) => value)(1, harness.ctx());

		expect(vi.getTimerCount()).toBe(0);
	});

	it("an infinite limit never fires, and a limit over 2^31 does not fire at once", async () => {
		const harness = createHarness();
		const gate = deferred<number>();
		const done = timeoutOf(Number.POSITIVE_INFINITY, () => gate.promise)(
			1,
			harness.ctx(),
		);
		await vi.advanceTimersByTimeAsync(2 ** 31 * 2);
		gate.resolve(5);

		await expect(done).resolves.toBe(5);
	});

	it("behaves as the ctx form: the same error for the same limit", async () => {
		const harness = createHarness();
		const viaTask = timeoutOf(20, () => new Promise<never>(() => {}))(
			1,
			harness.ctx(),
		);
		const viaCtx = timeout(
			harness.ctx(),
			20,
			() => new Promise<never>(() => {}),
		);
		const expectations = Promise.all([
			expect(viaTask).rejects.toMatchObject({
				name: "TimeoutError",
				message: "Timed out after 20ms",
			}),
			expect(viaCtx).rejects.toMatchObject({
				name: "TimeoutError",
				message: "Timed out after 20ms",
			}),
		]);
		await vi.advanceTimersByTimeAsync(20);

		await expectations;
	});

	it("retry around timeout retries after a timeout", async () => {
		const harness = createHarness();
		let calls = 0;
		const task = (value: number) => {
			calls++;
			return calls === 1
				? new Promise<never>(() => {})
				: Promise.resolve(value);
		};
		const wrapped = retry<number, TestEvents, Promise<number>>(
			timeoutOf(100, task),
			{ times: 2 },
		);
		const done = wrapped(9, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		await expect(done).resolves.toBe(9);
		expect(calls).toBe(2);
	});

	it("has a timeout group with a run child in the trace", async () => {
		const harness = createHarness();
		await timeoutOf(100, async (value) => value)(1, harness.ctx());
		const phases = harness
			.phases()
			.filter((phase) => /^(timeout|run)\//.test(phase));

		expect(phases).toEqual([
			"timeout/start",
			"run/start",
			"run/done",
			"timeout/done",
		]);
	});
});
