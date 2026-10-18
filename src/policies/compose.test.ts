import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { debounce } from "./debounce";
import { latest } from "./latest";
import { leading } from "./leading";
import { throttle } from "./throttle";

const latestTask = <P, R>(handler: Task<P, TestEvents, R>) => latest(handler);
const leadingTask = <P, R>(handler: Task<P, TestEvents, R>) => leading(handler);
const debounceTask = <P, R>(ms: number, handler: Task<P, TestEvents, R>) =>
	debounce(ms, handler);
const throttleTask = <P, R>(ms: number, handler: Task<P, TestEvents, R>) =>
	throttle(ms, handler);

describe("policy composition", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("throttle(latest): the trailing run aborts a leading run that is still going", async () => {
		const harness = createHarness();
		const signals: AbortSignal[] = [];
		const throttled = throttleTask(
			100,
			latestTask((_: number, ctx) => {
				signals.push(ctx.signal);
				return new Promise(() => {});
			}),
		);
		throttled(1, harness.ctx());
		throttled(2, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(signals).toHaveLength(2);
		expect(signals[0]?.aborted).toBe(true);
		expect(signals[1]?.aborted).toBe(false);
	});

	it("throttle(latest): a finished leading run is left alone", async () => {
		const harness = createHarness();
		const signals: AbortSignal[] = [];
		const throttled = throttleTask(
			100,
			latestTask(async (_: number, ctx) => {
				signals.push(ctx.signal);
			}),
		);
		await throttled(1, harness.ctx());
		throttled(2, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(signals[0]?.aborted).toBe(false);
	});

	it("debounce(leading): a debounced run that fires while the previous is in flight aborts it and takes over", async () => {
		const harness = createHarness();
		const signals: AbortSignal[] = [];
		const gate = deferred();
		const debounced = debounceTask(
			100,
			leadingTask((_: number, ctx) => {
				signals.push(ctx.signal);
				return gate.promise;
			}),
		);
		debounced(1, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);
		debounced(2, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(signals).toHaveLength(2);
		expect(signals[0]?.aborted).toBe(true);
		expect(signals[1]?.aborted).toBe(false);
		gate.resolve();
	});

	it("leading(latest): the lock keeps latest from ever superseding", () => {
		const harness = createHarness();
		const signals: AbortSignal[] = [];
		const leading = leadingTask(
			latestTask((_: number, ctx) => {
				signals.push(ctx.signal);
				return new Promise(() => {});
			}),
		);
		leading(1, harness.ctx());
		leading(2, harness.ctx());
		leading(3, harness.ctx());

		expect(signals).toHaveLength(1);
		expect(signals[0]?.aborted).toBe(false);
	});

	it("debounce(latest): a new call after the run started aborts the inner signal", async () => {
		const harness = createHarness();
		const signals: AbortSignal[] = [];
		const debounced = debounceTask(
			100,
			latestTask((_: number, ctx) => {
				signals.push(ctx.signal);
				return new Promise(() => {});
			}),
		);
		debounced(1, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);
		debounced(2, harness.ctx());

		expect(signals[0]?.aborted).toBe(true);
	});

	it("nests the trace: the inner policy is a child of the outer one", async () => {
		const harness = createHarness();
		debounceTask(
			100,
			latestTask(async () => {}),
		)(1, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);
		const outer = harness.recorder.events.find(
			(event) => event.effect === "debounce",
		);
		const inner = harness.recorder.events.find(
			(event) => event.effect === "latest",
		);

		expect(inner?.parent).toBe(outer?.id);
		expect(outer?.parent).not.toBe(inner?.parent);
	});

	it("an abort of the handler task reaches the deepest run", async () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		const signals: AbortSignal[] = [];
		const chain = throttleTask(
			50,
			debounceTask(
				50,
				latestTask((_: number, ctx) => {
					signals.push(ctx.signal);
					return new Promise(() => {});
				}),
			),
		);
		chain(1, ctx);
		await vi.advanceTimersByTimeAsync(50);
		expect(signals).toHaveLength(1);
		ctx.abort("gone");

		expect(signals[0]?.aborted).toBe(true);
		expect(signals[0]?.reason).toBe("gone");
	});

	it("an abort of the handler task during a debounce wait runs nothing", async () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		const handler = vi.fn();
		throttleTask(50, debounceTask(100, latestTask(handler)))(1, ctx);
		await vi.advanceTimersByTimeAsync(50);
		ctx.abort();
		await vi.advanceTimersByTimeAsync(500);

		expect(handler).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("the same wrapped handler on a bus keeps one state for all emits", async () => {
		const harness = createHarness();
		const handler = vi.fn();
		harness.bus.on("t", throttleTask(100, latestTask(handler)));
		for (let index = 1; index <= 5; index++) {
			harness.bus.emit("t", index);
		}
		await vi.advanceTimersByTimeAsync(100);

		expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 5]);
	});
});
