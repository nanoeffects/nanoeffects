import { describe, expect, it, vi } from "vitest";
import type { Context } from "../core/bus";
import { callLifecycle, reportsLifecycle } from "../core/lifecycle-key";
import { createHarness, type TestEvents } from "../tests/test-helpers";
import { debounce } from "./debounce";
import { latest } from "./latest";
import { leading } from "./leading";
import { dropCall, endCall, startCall } from "./lifecycle";
import { queue } from "./queue";
import { throttle } from "./throttle";

const lifecycle = () => ({
	start: vi.fn(),
	drop: vi.fn(),
	cancel: vi.fn(),
	done: vi.fn(),
});

describe("policy lifecycle reports", () => {
	it("do nothing, and still run the handler, when the context has no lifecycle", () => {
		const harness = createHarness();
		const ctx = harness.ctx();

		expect(startCall(ctx, "leading", () => 5)).toBe(5);
		expect(() => dropCall(ctx, "leading")).not.toThrow();
		expect(() => endCall(ctx, true, "stop")).not.toThrow();
	});

	it("reach the lifecycle that a job put on the context", () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		const reports = lifecycle();
		Reflect.set(ctx, callLifecycle, reports);

		startCall(ctx, "leading", () => 1);
		dropCall(ctx, "leading");
		endCall(ctx, true, "stop");
		endCall(ctx, false, "stop");

		expect(reports.start).toHaveBeenCalledTimes(1);
		expect(reports.drop).toHaveBeenCalledTimes(2);
		expect(reports.cancel).toHaveBeenCalledWith("stop");
	});

	it.each([
		["latest", latest(() => 1)],
		["leading", leading(() => 1)],
		["debounce", debounce(10, () => 1)],
		["throttle", throttle(10, () => 1)],
		["queue", queue(() => 1)],
		["a keyed latest", latest(() => 1, { key: () => "a" })],
	])("%s is marked as a policy that reports", (_name, policy) => {
		expect(Reflect.get(policy, reportsLifecycle)).toBe(true);
	});

	it("a policy runs on a plain context with no lifecycle, as before", async () => {
		const harness = createHarness();
		const callback = (value: number, _ctx: Context<TestEvents>) => value * 2;

		expect(leading(callback)(2, harness.ctx())).toBe(4);
	});
});
