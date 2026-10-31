import { describe, expect, it } from "vitest";
import { type Context, createBus } from "../core/bus";
import type { TraceEvent } from "../core/types";
import { createTraceRecorder } from "./recorder";
import { createTracer } from "./tracer";

const event = (id: number, patch: Partial<TraceEvent> = {}): TraceEvent => ({
	id,
	type: "search",
	effect: "latest",
	phase: "start",
	payload: "q",
	...patch,
});

const ids = (events: readonly TraceEvent[]) => events.map((item) => item.id);

describe("createTraceRecorder without a capacity", () => {
	it("keeps every event, oldest first", () => {
		const recorder = createTraceRecorder();
		for (let id = 1; id <= 1000; id += 1) {
			recorder(event(id));
		}

		expect(recorder.events).toHaveLength(1000);
		expect(ids(recorder.events).slice(0, 2)).toEqual([1, 2]);
	});

	it("returns the same array on every read, also after clear", () => {
		const recorder = createTraceRecorder();
		const { events } = recorder;
		recorder(event(1));
		recorder.clear();

		expect(recorder.events).toBe(events);
	});

	it.each([
		["zero", 0],
		["negative", -1],
		["fractional", 1.5],
		["NaN", Number.NaN],
		["Infinity", Number.POSITIVE_INFINITY],
	])("ignores a %s capacity", (_name, capacity) => {
		const recorder = createTraceRecorder({ capacity });
		for (let id = 1; id <= 10; id += 1) {
			recorder(event(id));
		}

		expect(recorder.events).toHaveLength(10);
	});

	it("ignores a null option and a null capacity", () => {
		const withNullOptions = createTraceRecorder(null as never);
		const withNullCapacity = createTraceRecorder({ capacity: null as never });
		withNullOptions(event(1));
		withNullCapacity(event(1));

		expect(withNullOptions.events).toHaveLength(1);
		expect(withNullCapacity.events).toHaveLength(1);
	});
});

describe("createTraceRecorder with a capacity", () => {
	it("lists the events in order under the capacity", () => {
		const recorder = createTraceRecorder({ capacity: 3 });
		recorder(event(1));
		recorder(event(2));

		expect(ids(recorder.events)).toEqual([1, 2]);
	});

	it("keeps the last events past the capacity", () => {
		const recorder = createTraceRecorder({ capacity: 3 });
		for (let id = 1; id <= 5; id += 1) {
			recorder(event(id));
		}

		expect(ids(recorder.events)).toEqual([3, 4, 5]);
	});

	it("keeps the order after several turns of the buffer", () => {
		const recorder = createTraceRecorder({ capacity: 3 });
		for (let id = 1; id <= 10; id += 1) {
			recorder(event(id));
		}

		expect(ids(recorder.events)).toEqual([8, 9, 10]);
	});

	it("lists exactly the capacity when it is full", () => {
		const recorder = createTraceRecorder({ capacity: 3 });
		for (let id = 1; id <= 3; id += 1) {
			recorder(event(id));
		}

		expect(ids(recorder.events)).toEqual([1, 2, 3]);
	});

	it("keeps one event with a capacity of one", () => {
		const recorder = createTraceRecorder({ capacity: 1 });
		recorder(event(1));
		recorder(event(2));

		expect(ids(recorder.events)).toEqual([2]);
	});

	it("keeps the event objects as they are", () => {
		const recorder = createTraceRecorder({ capacity: 2 });
		const first = event(1);
		recorder(first);

		expect(recorder.events[0]).toBe(first);
	});

	it("gives a snapshot that later events do not change", () => {
		const recorder = createTraceRecorder({ capacity: 3 });
		recorder(event(1));
		const snapshot = recorder.events;
		recorder(event(2));

		expect(ids(snapshot)).toEqual([1]);
		expect(ids(recorder.events)).toEqual([1, 2]);
	});

	it("is not disturbed by a caller that changes a read array", () => {
		const recorder = createTraceRecorder({ capacity: 3 });
		recorder(event(1));
		recorder(event(2));
		recorder.events.length = 0;

		expect(ids(recorder.events)).toEqual([1, 2]);
	});

	it("is empty after clear and records from the start", () => {
		const recorder = createTraceRecorder({ capacity: 2 });
		for (let id = 1; id <= 5; id += 1) {
			recorder(event(id));
		}
		recorder.clear();

		expect(recorder.events).toEqual([]);

		recorder(event(6));

		expect(ids(recorder.events)).toEqual([6]);
	});

	it("keeps the order after clear and a second wrap", () => {
		const recorder = createTraceRecorder({ capacity: 2 });
		for (let id = 1; id <= 3; id += 1) {
			recorder(event(id));
		}
		recorder.clear();
		for (let id = 10; id <= 12; id += 1) {
			recorder(event(id));
		}

		expect(ids(recorder.events)).toEqual([11, 12]);
	});

	it("does not keep a reference to an event that was pushed out", () => {
		const recorder = createTraceRecorder({ capacity: 1 });
		const pushedOut = event(1);
		recorder(pushedOut);
		recorder(event(2));

		expect(recorder.events).not.toContain(pushedOut);
	});
});

describe("createTraceRecorder as a logger", () => {
	type Events = { ping: number };

	/** A task context of a bus, as `createHarness().ctx()` makes it. */
	const contextOf = (bus: ReturnType<typeof createBus<Events>>) => {
		const captured: Context<Events>[] = [];
		const off = bus.on("ping", (_, ctx) => {
			captured.push(ctx);
		});
		bus.emit("ping", 0);
		off();
		const [ctx] = captured;
		if (!ctx) {
			throw new Error("no context captured");
		}
		return ctx;
	};

	it("records the events a tracer makes", async () => {
		const recorder = createTraceRecorder<Events>();
		const bus = createBus<Events>({ trace: createTracer(recorder) });
		await contextOf(bus).run(() => 1);

		expect(recorder.events.map((item) => item.phase)).toEqual([
			"start",
			"done",
		]);
	});

	it("keeps only the last events of a real bus", async () => {
		const recorder = createTraceRecorder<Events>({ capacity: 1 });
		const bus = createBus<Events>({ trace: createTracer(recorder) });
		await contextOf(bus).run(() => 1);

		expect(recorder.events.map((item) => item.phase)).toEqual(["done"]);
	});

	it("works in an array of loggers", async () => {
		const recorder = createTraceRecorder<Events>({ capacity: 2 });
		const seen: number[] = [];
		const counter = (item: TraceEvent<Events>) => {
			seen.push(item.id);
		};
		const bus = createBus<Events>({ trace: createTracer([recorder, counter]) });
		await contextOf(bus).run(() => 1);

		expect(seen).toHaveLength(2);
		expect(recorder.events).toHaveLength(2);
	});
});
