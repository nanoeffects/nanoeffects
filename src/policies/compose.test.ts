import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, deferred, type TestEvents } from "../test-helpers";
import type { Task } from "../types";
import { debounce } from "./debounce";
import { latest } from "./latest";
import { leading } from "./leading";
import { throttle } from "./throttle";

const lat = <P, R>(fn: Task<P, TestEvents, R>) => latest(fn);
const lead = <P, R>(fn: Task<P, TestEvents, R>) => leading(fn);
const deb = <P, R>(ms: number, fn: Task<P, TestEvents, R>) => debounce(ms, fn);
const thr = <P, R>(ms: number, fn: Task<P, TestEvents, R>) => throttle(ms, fn);

describe("policy composition", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("throttle(latest): the trailing run aborts a leading run that is still going", async () => {
		const h = createHarness();
		const signals: AbortSignal[] = [];
		const t = thr(
			100,
			lat((_: number, c) => {
				signals.push(c.signal);
				return new Promise(() => {});
			}),
		);
		t(1, h.ctx());
		t(2, h.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(signals).toHaveLength(2);
		expect(signals[0]?.aborted).toBe(true);
		expect(signals[1]?.aborted).toBe(false);
	});

	it("throttle(latest): a finished leading run is left alone", async () => {
		const h = createHarness();
		const signals: AbortSignal[] = [];
		const t = thr(
			100,
			lat(async (_: number, c) => {
				signals.push(c.signal);
			}),
		);
		await t(1, h.ctx());
		t(2, h.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(signals[0]?.aborted).toBe(false);
	});

	it("debounce(leading): a debounced run that fires while the previous is in flight aborts it and takes over", async () => {
		const h = createHarness();
		const signals: AbortSignal[] = [];
		const d = deferred();
		const db = deb(
			100,
			lead((_: number, c) => {
				signals.push(c.signal);
				return d.promise;
			}),
		);
		db(1, h.ctx());
		await vi.advanceTimersByTimeAsync(100);
		db(2, h.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(signals).toHaveLength(2);
		expect(signals[0]?.aborted).toBe(true);
		expect(signals[1]?.aborted).toBe(false);
		d.resolve();
	});

	it("leading(latest): the lock keeps latest from ever superseding", () => {
		const h = createHarness();
		const signals: AbortSignal[] = [];
		const l = lead(
			lat((_: number, c) => {
				signals.push(c.signal);
				return new Promise(() => {});
			}),
		);
		l(1, h.ctx());
		l(2, h.ctx());
		l(3, h.ctx());

		expect(signals).toHaveLength(1);
		expect(signals[0]?.aborted).toBe(false);
	});

	it("debounce(latest): a new call after the run started aborts the inner signal", async () => {
		const h = createHarness();
		const signals: AbortSignal[] = [];
		const db = deb(
			100,
			lat((_: number, c) => {
				signals.push(c.signal);
				return new Promise(() => {});
			}),
		);
		db(1, h.ctx());
		await vi.advanceTimersByTimeAsync(100);
		db(2, h.ctx());

		expect(signals[0]?.aborted).toBe(true);
	});

	it("nests the trace: the inner policy is a child of the outer one", async () => {
		const h = createHarness();
		deb(
			100,
			lat(async () => {}),
		)(1, h.ctx());
		await vi.advanceTimersByTimeAsync(100);
		const outer = h.recorder.events.find((e) => e.effect === "debounce");
		const inner = h.recorder.events.find((e) => e.effect === "latest");

		expect(inner?.parent).toBe(outer?.id);
		expect(outer?.parent).not.toBe(inner?.parent);
	});

	it("an abort of the handler task reaches the deepest run", async () => {
		const h = createHarness();
		const ctx = h.ctx();
		const signals: AbortSignal[] = [];
		const chain = thr(
			50,
			deb(
				50,
				lat((_: number, c) => {
					signals.push(c.signal);
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
		const h = createHarness();
		const ctx = h.ctx();
		const fn = vi.fn();
		thr(50, deb(100, lat(fn)))(1, ctx);
		await vi.advanceTimersByTimeAsync(50);
		ctx.abort();
		await vi.advanceTimersByTimeAsync(500);

		expect(fn).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("the same wrapped handler on a bus keeps one state for all emits", async () => {
		const h = createHarness();
		const fn = vi.fn();
		h.bus.on("t", thr(100, lat(fn)));
		for (let i = 1; i <= 5; i++) {
			h.bus.emit("t", i);
		}
		await vi.advanceTimersByTimeAsync(100);

		expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 5]);
	});
});
