import { afterEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { TraceEvent } from "../core/types";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { createHarness, deferred, type TestEvents } from "./test-helpers";

describe("bus trace", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("works without a trace option", async () => {
		const bus = createBus<TestEvents>();
		let run: Promise<unknown> | null = null;
		bus.on("t", (_, ctx) => {
			run = ctx.run(() => 1);
		});
		bus.emit("t", 1);

		await expect(run).resolves.toBe(1);
	});

	it("accepts one logger", async () => {
		const events: TraceEvent[] = [];
		const bus = createBus<TestEvents>({
			trace: createTracer((error) => events.push(error)),
		});
		bus.on("t", (_, ctx) => ctx.run(() => 1));
		bus.emit("t", 1);
		await Promise.resolve();

		expect(events.length).toBeGreaterThan(0);
	});

	it("accepts several loggers and gives each every event", async () => {
		const first = createTraceRecorder<TestEvents>();
		const second = createTraceRecorder<TestEvents>();
		const bus = createBus<TestEvents>({ trace: createTracer([first, second]) });
		bus.on("t", (_, ctx) => ctx.run(() => 1));
		bus.emit("t", 1);
		await Promise.resolve();

		expect(first.events.length).toBeGreaterThan(0);
		expect(second.events).toEqual(first.events);
	});

	it("keeps working when a logger throws", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const recorder = createTraceRecorder<TestEvents>();
		const bus = createBus<TestEvents>({
			trace: createTracer([
				() => {
					throw new Error("bad logger");
				},
				recorder,
			]),
		});
		let result: Promise<unknown> | null = null;
		bus.on("t", (_, ctx) => {
			result = ctx.run(() => "ok");
		});
		bus.emit("t", 1);

		await expect(result).resolves.toBe("ok");
		expect(recorder.events.map((event) => event.phase)).toEqual([
			"start",
			"done",
		]);
	});

	it("gives every task a unique increasing id", async () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		await Promise.all([ctx.run(() => 1), ctx.run(() => 2), ctx.run(() => 3)]);
		const ids = harness.recorder.events
			.filter((event) => event.phase === "start")
			.map((event) => event.id);

		expect(new Set(ids).size).toBe(3);
		expect([...ids].sort((x, y) => x - y)).toEqual(ids);
	});

	it("gives separate buses separate id sequences", () => {
		const first = createHarness();
		const second = createHarness();
		first.ctx().run(() => 1);
		second.ctx().run(() => 1);

		expect(first.recorder.events[0]?.id).toBe(second.recorder.events[0]?.id);
	});

	it("reports type, effect and payload", async () => {
		const harness = createHarness();
		await harness.ctx(42).run(() => 1, 7);

		expect(harness.recorder.events[0]).toMatchObject({
			type: "t",
			effect: "run",
			phase: "start",
			payload: 7,
		});
	});

	it("links a child to its parent", async () => {
		const harness = createHarness();
		await harness.ctx().run((_: number, outer) => outer.run(() => 1), 1);
		const [outer, inner] = harness.recorder.events.filter(
			(event) => event.phase === "start",
		);

		expect(outer?.parent).toBeTypeOf("number");
		expect(inner?.parent).toBe(outer?.id);
	});

	it("reports an error with its cause", async () => {
		const harness = createHarness();
		const error = new Error("boom");
		await harness
			.ctx()
			.run(() => {
				throw error;
			})
			.catch(() => {});
		const last = harness.recorder.events.at(-1);

		expect(last?.phase).toBe("error");
		expect(last?.error).toBe(error);
	});

	it("does not set error on other phases", async () => {
		const harness = createHarness();
		await harness.ctx().run(() => 1);

		expect("error" in (harness.recorder.events.at(-1) ?? {})).toBe(false);
	});

	it("reports cancel when the task is aborted while running", async () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		const gate = deferred();
		const promise = ctx.run(() => gate.promise);
		ctx.abort();
		gate.resolve();
		await promise;

		expect(harness.phases()).toEqual(["run/start", "run/cancel"]);
	});

	it("reports each task only once, even if aborted after it finished", async () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		await ctx.run(() => 1);
		ctx.abort();

		expect(harness.phases()).toEqual(["run/start", "run/done"]);
	});
});
