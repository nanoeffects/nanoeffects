import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../core/types";
import { createHarness, type TestEvents } from "../tests/test-helpers";
import { type PollOptions, poll } from "./poll";

// the Task form is typed for the events of the bus it goes to; the tests pin them
const pollOf = <R>(
	ms: number | ((call: number) => number),
	task: Task<number, TestEvents, R>,
	options?: PollOptions,
) => poll<number, TestEvents, R>(ms, task, options);

describe("poll as a Task", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not call the Task until it is run", () => {
		const task = vi.fn((value: number) => value);
		pollOf(100, task);

		expect(task).not.toHaveBeenCalled();
	});

	it("calls the Task after each pause with the payload, and ends without an error on abort", async () => {
		const harness = createHarness();
		const caller = harness.ctx();
		const task = vi.fn((_value: number) => {});
		const done = pollOf(100, task)(7, caller);
		await vi.advanceTimersByTimeAsync(250);
		caller.abort();

		await expect(done).resolves.toBeUndefined();
		expect(task).toHaveBeenCalledTimes(2);
		expect(task.mock.calls[0]?.[0]).toBe(7);
	});

	it("leading also calls it at once", async () => {
		const harness = createHarness();
		const caller = harness.ctx();
		const task = vi.fn((_value: number) => {});
		const done = pollOf(100, task, { leading: true })(1, caller);
		expect(task).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(100);
		caller.abort();
		await done;

		expect(task).toHaveBeenCalledTimes(2);
	});

	it("keeps a steady rate whatever the duration, unless waitForFn", async () => {
		const harness = createHarness();
		const steady = harness.ctx();
		const waiting = harness.ctx();
		const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 150));
		const steadyTask = vi.fn(slow);
		const waitingTask = vi.fn(slow);
		const first = pollOf(100, steadyTask)(1, steady);
		const second = pollOf(100, waitingTask, { waitForFn: true })(1, waiting);
		await vi.advanceTimersByTimeAsync(450);
		steady.abort();
		waiting.abort();
		await Promise.all([first, second]);

		expect(steadyTask).toHaveBeenCalledTimes(4);
		expect(waitingTask).toHaveBeenCalledTimes(2);
	});

	it("takes a function for the pause, with the number of the call it leads to", async () => {
		const harness = createHarness();
		const caller = harness.ctx();
		const pauses: number[] = [];
		const task = vi.fn((_value: number) => {});
		const done = pollOf((call) => {
			pauses.push(call);
			return 100 * (call + 1);
		}, task)(1, caller);
		await vi.advanceTimersByTimeAsync(100 + 200 + 300);
		caller.abort();
		await done;

		expect(task).toHaveBeenCalledTimes(3);
		expect(pauses.slice(0, 3)).toEqual([0, 1, 2]);
	});

	it("an error of the Task stops the polling and rejects", async () => {
		const harness = createHarness();
		let calls = 0;
		const task = () => {
			calls++;
			throw new Error("boom");
		};
		const done = pollOf(100, task)(1, harness.ctx());
		const expectation = expect(done).rejects.toThrow("boom");
		await vi.advanceTimersByTimeAsync(1000);

		await expectation;
		expect(calls).toBe(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("gives each call its own child context of the caller", async () => {
		const harness = createHarness();
		const caller = harness.ctx();
		const seen: unknown[] = [];
		const task = (_value: number, ctx: unknown) => {
			seen.push(ctx);
		};
		const done = pollOf(100, task)(1, caller);
		await vi.advanceTimersByTimeAsync(250);
		caller.abort();
		await done;

		expect(seen).toHaveLength(2);
		expect(seen[0]).not.toBe(seen[1]);
		expect(seen[0]).not.toBe(caller);
	});

	it("leaves no timer after an abort, also when it was aborted before it started", async () => {
		const harness = createHarness();
		const caller = harness.ctx();
		const done = pollOf(100, () => {})(1, caller);
		caller.abort();
		await done;
		const aborted = harness.ctx();
		aborted.abort();
		await pollOf(100, () => {})(1, aborted);

		expect(vi.getTimerCount()).toBe(0);
	});

	it("has a poll group with a run child for each call in the trace", async () => {
		const harness = createHarness();
		const caller = harness.ctx();
		const done = pollOf(100, () => {})(1, caller);
		await vi.advanceTimersByTimeAsync(100);
		caller.abort();
		await done;
		const phases = harness
			.phases()
			.filter((phase) => /^(poll|run)\//.test(phase));

		expect(phases.slice(0, 3)).toEqual(["poll/start", "run/start", "run/done"]);
	});
});
