import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { TraceEvent } from "../core/types";
import { latest } from "../policies";
import { delay } from "../utils";
import { createTraceRecorder } from "./recorder";
import { timingLogger } from "./timing";
import { createTracer } from "./tracer";

const event = (patch: Partial<TraceEvent> = {}): TraceEvent => ({
	id: 1,
	type: "search",
	effect: "latest",
	phase: "start",
	payload: "q",
	...patch,
});

const clockAt = () => {
	const clock = { time: 0 };
	return { clock, now: () => clock.time };
};

describe("timingLogger", () => {
	it("measures a finished task", () => {
		const { clock, now } = clockAt();
		const timing = timingLogger({ now });
		timing(event({ phase: "start" }));
		clock.time = 40;
		timing(event({ phase: "done" }));

		expect(timing.durations).toEqual([
			{ id: 1, type: "search", effect: "latest", phase: "done", ms: 40 },
		]);
	});

	it("measures a cancelled task", () => {
		const { clock, now } = clockAt();
		const timing = timingLogger({ now });
		timing(event());
		clock.time = 15;
		timing(event({ phase: "cancel" }));

		expect(timing.durations[0]).toMatchObject({ phase: "cancel", ms: 15 });
	});

	it("records a failed task", () => {
		const timing = timingLogger({ now: () => 0 });
		timing(event());
		timing(event({ phase: "error", error: new Error("x") }));

		expect(timing.durations[0]?.phase).toBe("error");
	});

	it("closes a dropped call", () => {
		const timing = timingLogger({ now: () => 0 });
		timing(event());
		timing(event({ phase: "drop" }));

		expect(timing.pending()).toEqual([]);
		expect(timing.durations[0]?.phase).toBe("drop");
	});

	it("ignores a closing event with no start", () => {
		const timing = timingLogger({ now: () => 0 });
		timing(event({ phase: "done" }));

		expect(timing.durations).toEqual([]);
		expect(timing.pending()).toEqual([]);
	});

	it("counts only the first closing phase", () => {
		const timing = timingLogger({ now: () => 0 });
		timing(event());
		timing(event({ phase: "cancel" }));
		timing(event({ phase: "done" }));

		expect(timing.durations.map((task) => task.phase)).toEqual(["cancel"]);
	});

	it("keeps the parent, the root and the source", () => {
		const timing = timingLogger({ now: () => 0 });
		timing(event({ id: 3, parentId: 2, rootId: 1, source: "a.ts:1:1" }));
		timing(event({ id: 3, phase: "done" }));

		expect(timing.durations[0]).toMatchObject({
			parentId: 2,
			rootId: 1,
			source: "a.ts:1:1",
		});
	});

	it("tells tasks of different effects apart", () => {
		const { clock, now } = clockAt();
		const timing = timingLogger({ now });
		timing(event({ effect: "latest" }));
		clock.time = 5;
		timing(event({ effect: "retry" }));
		clock.time = 9;
		timing(event({ effect: "latest", phase: "done" }));

		expect(timing.pending()).toEqual([
			{ id: 1, type: "search", effect: "retry", ms: 4 },
		]);
	});

	it("lists open tasks with the time since start, oldest first", () => {
		const { clock, now } = clockAt();
		const timing = timingLogger({ now });
		timing(event({ id: 1 }));
		clock.time = 10;
		timing(event({ id: 2, type: "save" }));
		clock.time = 30;

		expect(timing.pending()).toEqual([
			{ id: 1, type: "search", effect: "latest", ms: 30 },
			{ id: 2, type: "save", effect: "latest", ms: 20 },
		]);
	});

	it("keeps the last closed tasks with a capacity, and never cuts pending", () => {
		const timing = timingLogger({ now: () => 0, capacity: 2 });
		for (const id of [1, 2, 3]) {
			timing(event({ id }));
			timing(event({ id, phase: "done" }));
		}
		timing(event({ id: 4 }));
		timing(event({ id: 5 }));

		expect(timing.durations.map((task) => task.id)).toEqual([2, 3]);
		expect(timing.pending()).toHaveLength(2);
	});

	it("ignores a capacity that is not a positive integer", () => {
		const timing = timingLogger({ now: () => 0, capacity: 0 });
		for (const id of [1, 2, 3]) {
			timing(event({ id }));
			timing(event({ id, phase: "done" }));
		}

		expect(timing.durations).toHaveLength(3);
	});

	it("clear empties both lists", () => {
		const timing = timingLogger({ now: () => 0 });
		timing(event({ id: 1 }));
		timing(event({ id: 2 }));
		timing(event({ id: 2, phase: "done" }));
		timing.clear();

		expect(timing.durations).toEqual([]);
		expect(timing.pending()).toEqual([]);
	});

	describe("on a real bus", () => {
		type Events = { search: string };

		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it("measures a latest call, a cancel, and leaves nothing open", async () => {
			const timing = timingLogger();
			const recorder = createTraceRecorder<Events>();
			const trace = createTracer<Events>([recorder, timing]);
			const bus = createBus<Events>({ trace });
			bus.on(
				"search",
				latest<string, Events, void>(async (_, ctx) => {
					await delay(ctx, 100);
				}),
			);

			bus.emit("search", "re");
			await vi.advanceTimersByTimeAsync(40);
			bus.emit("search", "redux");
			expect(timing.pending()).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(100);

			expect(timing.pending()).toEqual([]);
			const phases = timing.durations.map((task) => [task.phase, task.ms]);
			expect(phases).toContainEqual(["cancel", 40]);
			expect(phases).toContainEqual(["done", 100]);
			expect(recorder.events.length).toBeGreaterThan(0);
		});

		it("lists a task that never ends", async () => {
			const timing = timingLogger();
			const trace = createTracer<Events>(timing);
			const bus = createBus<Events>({ trace });
			bus.on(
				"search",
				latest<string, Events, void>(() => new Promise<void>(() => {})),
			);

			bus.emit("search", "q");
			await vi.advanceTimersByTimeAsync(500);

			expect(timing.pending()).toMatchObject([{ type: "search", ms: 500 }]);
		});
	});
});
