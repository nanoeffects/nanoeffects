// Options that are not set (null, undefined, empty) must fall back to defaults.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { poll } from "../effects";
import { debounce, queue, throttle } from "../policies";
import { createHarness, type TestEvents } from "./test-helpers";

describe("regressions: options that are not set", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("throttle takes undefined and null for leading, trailing and key", async () => {
		const harness = createHarness();
		const fired: number[] = [];
		const throttled = throttle<number, TestEvents, void>(
			100,
			(value) => {
				fired.push(value);
			},
			{ leading: null, trailing: void 0, key: null } as never,
		);
		throttled(1, harness.ctx());
		throttled(2, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(fired).toEqual([1, 2]);
	});

	it("debounce takes undefined and null for leading, trailing and key", async () => {
		const harness = createHarness();
		const fired: number[] = [];
		const debounced = debounce<number, TestEvents, void>(
			100,
			(value) => {
				fired.push(value);
			},
			{ leading: null, trailing: void 0, key: null } as never,
		);
		debounced(1, harness.ctx());
		debounced(2, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(fired).toEqual([2]);
	});

	it("queue takes undefined and null for concurrency, limit, overflow and key", async () => {
		vi.useRealTimers();
		const harness = createHarness();
		let running = 0;
		let max = 0;
		const queued = queue<number, TestEvents, void>(
			async () => {
				running++;
				max = Math.max(max, running);
				await Promise.resolve();
				running--;
			},
			{ concurrency: null, limit: void 0, overflow: null, key: null } as never,
		);
		await Promise.all([1, 2, 3].map((value) => queued(value, harness.ctx())));

		expect(max).toBe(1);
	});

	it("poll takes undefined and null for its options", async () => {
		const controller = new AbortController();
		const handler = vi.fn();
		poll(controller, handler, 100, {
			leading: null,
			waitForFn: void 0,
		} as never);
		await vi.advanceTimersByTimeAsync(250);
		controller.abort();

		expect(handler).toHaveBeenCalledTimes(2);
	});
});
