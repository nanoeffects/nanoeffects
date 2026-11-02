import { describe, expect, it } from "vitest";
import { createBus } from "../core/bus";
import type { TraceEvent } from "../core/types";
import { chainOf } from "./chain";
import { tracePlugin } from "./plugin";
import { createTraceRecorder } from "./recorder";
import { createTracer } from "./tracer";

const event = (patch: Partial<TraceEvent> = {}): TraceEvent => ({
	id: 1,
	type: "queryChanged",
	effect: "latest",
	phase: "start",
	payload: "q",
	...patch,
});

describe("chainOf", () => {
	it("returns the path from the root to the task", () => {
		const events = [
			event({ id: 1, type: "queryChanged" }),
			event({ id: 2, type: "searchLoaded", parentId: 1 }),
			event({ id: 3, type: "render", parentId: 2 }),
		];

		expect(chainOf(events, 3).map((step) => step.type)).toEqual([
			"queryChanged",
			"searchLoaded",
			"render",
		]);
	});

	it("returns a root as one step", () => {
		expect(chainOf([event()], 1)).toEqual([
			{ id: 1, type: "queryChanged", effect: "latest", phase: "start" },
		]);
	});

	it("starts at the oldest task in the list when a parent was pushed out", () => {
		const events = [event({ id: 5, type: "searchLoaded", parentId: 2 })];

		expect(chainOf(events, 5).map((step) => step.id)).toEqual([5]);
	});

	it("returns an empty path for an unknown id", () => {
		expect(chainOf([event()], 9)).toEqual([]);
	});

	it("takes the latest phase of a task", () => {
		const events = [event({ phase: "start" }), event({ phase: "error" })];

		expect(chainOf(events, 1)[0]?.phase).toBe("error");
	});

	it("keeps the source and the group of a step", () => {
		const events = [event({ source: "a.ts:1:2", traceGroupId: "search" })];

		expect(chainOf(events, 1)[0]).toMatchObject({
			source: "a.ts:1:2",
			traceGroupId: "search",
		});
	});

	it("stops on a cycle", () => {
		const events = [
			event({ id: 1, parentId: 2 }),
			event({ id: 2, parentId: 1 }),
		];

		expect(chainOf(events, 1)).toHaveLength(2);
	});

	it("does not change the list", () => {
		const events = [event({ id: 1 }), event({ id: 2, parentId: 1 })];
		const copy = [...events];
		chainOf(events, 2);

		expect(events).toEqual(copy);
	});

	it("keeps a listener that reports nothing in the path of a recorder", () => {
		type Events = { queryChanged: string; searchLoaded: string };
		const recorder = createTraceRecorder<Events>();
		const bus = createBus<Events>({ trace: createTracer(recorder) }).use(
			tracePlugin(),
		);
		bus.on("queryChanged", (query, ctx) => {
			ctx.emit("searchLoaded", query);
		});
		bus.on(
			"searchLoaded",
			() => {
				throw new Error("boom");
			},
			{ traceId: "render" },
		);
		expect(() => bus.emit("queryChanged", "q")).toThrow("boom");

		const failed = recorder.events.find((item) => item.phase === "error");
		const path = chainOf(recorder, failed?.id ?? -1);

		expect(path.map((step) => step.type)).toEqual(["queryChanged", "render"]);
		expect(path[0]?.phase).toBeUndefined();
		expect(path[1]?.phase).toBe("error");
	});

	it("shows only the tasks with events when given a list", () => {
		type Events = { queryChanged: string; searchLoaded: string };
		const recorder = createTraceRecorder<Events>();
		const bus = createBus<Events>({ trace: createTracer(recorder) }).use(
			tracePlugin(),
		);
		bus.on("queryChanged", (query, ctx) => {
			ctx.emit("searchLoaded", query);
		});
		bus.on(
			"searchLoaded",
			() => {
				throw new Error("boom");
			},
			{ traceId: "render" },
		);
		expect(() => bus.emit("queryChanged", "q")).toThrow("boom");

		const failed = recorder.events.find((item) => item.phase === "error");
		const path = chainOf(recorder.events, failed?.id ?? -1);

		expect(path.map((step) => step.type)).toEqual(["render"]);
	});
});
