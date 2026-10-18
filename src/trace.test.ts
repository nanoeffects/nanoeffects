import { afterEach, describe, expect, it, vi } from "vitest";
import { createBus } from "./bus";
import { createHarness, deferred, type TestEvents } from "./test-helpers";
import { createTraceRecorder } from "./trace/recorder";
import type { TraceEvent } from "./types";

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
		const bus = createBus<TestEvents>({ trace: (e) => events.push(e) });
		bus.on("t", (_, ctx) => ctx.run(() => 1));
		bus.emit("t", 1);
		await Promise.resolve();

		expect(events.length).toBeGreaterThan(0);
	});

	it("accepts several loggers and gives each every event", async () => {
		const a = createTraceRecorder<TestEvents>();
		const b = createTraceRecorder<TestEvents>();
		const bus = createBus<TestEvents>({ trace: [a, b] });
		bus.on("t", (_, ctx) => ctx.run(() => 1));
		bus.emit("t", 1);
		await Promise.resolve();

		expect(a.events.length).toBeGreaterThan(0);
		expect(b.events).toEqual(a.events);
	});

	it("keeps working when a logger throws", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const recorder = createTraceRecorder<TestEvents>();
		const bus = createBus<TestEvents>({
			trace: [
				() => {
					throw new Error("bad logger");
				},
				recorder,
			],
		});
		let result: Promise<unknown> | null = null;
		bus.on("t", (_, ctx) => {
			result = ctx.run(() => "ok");
		});
		bus.emit("t", 1);

		await expect(result).resolves.toBe("ok");
		expect(recorder.events.map((e) => e.phase)).toEqual(["start", "done"]);
	});

	it("gives every task a unique increasing id", async () => {
		const h = createHarness();
		const ctx = h.ctx();
		await Promise.all([ctx.run(() => 1), ctx.run(() => 2), ctx.run(() => 3)]);
		const ids = h.recorder.events
			.filter((e) => e.phase === "start")
			.map((e) => e.id);

		expect(new Set(ids).size).toBe(3);
		expect([...ids].sort((x, y) => x - y)).toEqual(ids);
	});

	it("gives separate buses separate id sequences", () => {
		const a = createHarness();
		const b = createHarness();
		a.ctx().run(() => 1);
		b.ctx().run(() => 1);

		expect(a.recorder.events[0]?.id).toBe(b.recorder.events[0]?.id);
	});

	it("reports type, effect and payload", async () => {
		const h = createHarness();
		await h.ctx(42).run(() => 1, 7);

		expect(h.recorder.events[0]).toMatchObject({
			type: "t",
			effect: "run",
			phase: "start",
			payload: 7,
		});
	});

	it("links a child to its parent", async () => {
		const h = createHarness();
		await h.ctx().run((_: number, outer) => outer.run(() => 1), 1);
		const [outer, inner] = h.recorder.events.filter((e) => e.phase === "start");

		expect(outer?.parent).toBeTypeOf("number");
		expect(inner?.parent).toBe(outer?.id);
	});

	it("reports an error with its cause", async () => {
		const h = createHarness();
		const error = new Error("boom");
		await h
			.ctx()
			.run(() => {
				throw error;
			})
			.catch(() => {});
		const last = h.recorder.events.at(-1);

		expect(last?.phase).toBe("error");
		expect(last?.error).toBe(error);
	});

	it("does not set error on other phases", async () => {
		const h = createHarness();
		await h.ctx().run(() => 1);

		expect("error" in (h.recorder.events.at(-1) ?? {})).toBe(false);
	});

	it("reports cancel when the task is aborted while running", async () => {
		const h = createHarness();
		const ctx = h.ctx();
		const d = deferred();
		const promise = ctx.run(() => d.promise);
		ctx.abort();
		d.resolve();
		await promise;

		expect(h.phases()).toEqual(["run/start", "run/cancel"]);
	});

	it("reports each task only once, even if aborted after it finished", async () => {
		const h = createHarness();
		const ctx = h.ctx();
		await ctx.run(() => 1);
		ctx.abort();

		expect(h.phases()).toEqual(["run/start", "run/done"]);
	});
});
