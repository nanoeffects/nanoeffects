import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../core/bus";
import { callLifecycle, reportsLifecycle } from "../core/lifecycle-key";
import { createHarness, type TestEvents } from "../tests/test-helpers";
import { debounce } from "./debounce";
import { latest } from "./latest";
import { leading } from "./leading";
import { queue } from "./queue";
import { throttle } from "./throttle";

// typed, so a wrapper takes the context of the test bus
const never = (_value: number, _ctx: Context<TestEvents>) =>
	new Promise<number>(() => {});
const record = (_value: number, _ctx: Context<TestEvents>) => {};

describe("policies called without a task", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("debounce(ms) debounces like debounce(ms, task)", async () => {
		const harness = createHarness();
		const handler = vi.fn(record);
		const wrap = debounce(100);
		const debounced = wrap(handler);

		debounced(1, harness.ctx());
		debounced(2, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0]?.[0]).toBe(2);
	});

	it("debounce(ms, options) passes the options on", async () => {
		const harness = createHarness();
		const handler = vi.fn(record);
		const debounced = debounce(100, { leading: true, trailing: false })(
			handler,
		);

		debounced(1, harness.ctx());
		debounced(2, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0]?.[0]).toBe(1);
	});

	it("throttle(ms) throttles like throttle(ms, task)", async () => {
		const harness = createHarness();
		const handler = vi.fn(record);
		const throttled = throttle(100)(handler);

		throttled(1, harness.ctx());
		throttled(2, harness.ctx());
		throttled(3, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(handler.mock.calls.map(([value]) => value)).toEqual([1, 3]);
	});

	it("latest() aborts the previous run", async () => {
		const harness = createHarness();
		const signals: AbortSignal[] = [];
		const latestTask = latest()((_: number, ctx: Context<TestEvents>) => {
			signals.push(ctx.signal);
			return never(0, ctx);
		});

		latestTask(1, harness.ctx());
		latestTask(2, harness.ctx());

		expect(signals[0]?.aborted).toBe(true);
		expect(signals[1]?.aborted).toBe(false);
	});

	it("leading() drops calls while one runs", () => {
		const harness = createHarness();
		const handler = vi.fn(never);
		const leadingTask = leading()(handler);

		leadingTask(1, harness.ctx());
		leadingTask(2, harness.ctx());

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("queue(options) runs one after another and keeps its options", async () => {
		const harness = createHarness();
		let running = 0;
		let peak = 0;
		const handler = async (_: number, _ctx: Context<TestEvents>) => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, 10));
			running--;
		};
		const queued = queue({ concurrency: 2 })(handler);

		const calls = [1, 2, 3, 4].map((value) => queued(value, harness.ctx()));
		await vi.advanceTimersByTimeAsync(50);
		await Promise.all(calls);

		expect(peak).toBe(2);
	});

	it("a key option gives each key its own state", async () => {
		const harness = createHarness();
		const handler = vi.fn(never);
		const keyed = latest({ key: (value: number) => value % 2 })(handler);

		keyed(1, harness.ctx());
		keyed(2, harness.ctx());
		keyed(3, harness.ctx());

		expect(handler).toHaveBeenCalledTimes(3);
		const firstSignal = handler.mock.calls[0]?.[1].signal;
		const secondSignal = handler.mock.calls[1]?.[1].signal;
		expect(firstSignal?.aborted).toBe(true);
		expect(secondSignal?.aborted).toBe(false);
	});

	it("one wrapper makes an own policy for each task", () => {
		const harness = createHarness();
		const wrap = latest();
		const first = vi.fn(never);
		const second = vi.fn(never);

		wrap(first)(1, harness.ctx());
		wrap(second)(1, harness.ctx());

		expect(first.mock.calls[0]?.[1].signal.aborted).toBe(false);
	});

	it("a wrapper with null options works like one with none", () => {
		const harness = createHarness();
		const handler = vi.fn(never);
		const wrapper = Reflect.apply(latest, void 0, [null]);

		wrapper(handler)(1, harness.ctx());

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it.each([
		["latest", latest()(() => 1)],
		["leading", leading()(() => 1)],
		["debounce", debounce(10)(() => 1)],
		["throttle", throttle(10)(() => 1)],
		["queue", queue()(() => 1)],
		["a keyed latest", latest({ key: (value: number) => value })(() => 1)],
	])(
		"%s from a wrapper is marked as a policy that reports",
		(_name, policy) => {
			expect(Reflect.get(policy, reportsLifecycle)).toBe(true);
		},
	);

	it("a wrapper-made task reports start and done to a job's lifecycle", async () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		const reports = {
			start: vi.fn(),
			drop: vi.fn(),
			cancel: vi.fn(),
			done: vi.fn(),
		};
		Reflect.set(ctx, callLifecycle, reports);
		const queued = queue()((value: number, _ctx: Context<TestEvents>) => value);

		await queued(1, ctx);

		expect(reports.start).toHaveBeenCalledTimes(1);
		expect(reports.done).toHaveBeenCalledTimes(1);
	});
});
