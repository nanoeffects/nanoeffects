import { describe, expect, it, vi } from "vitest";
import { createBus } from "../bus";
import { createHarness, type TestEvents } from "../test-helpers";
import type { TraceEvent } from "../types";
import { consoleLogger } from "./console";
import { performanceLogger } from "./performance";
import { createTraceRecorder } from "./recorder";
import { type ReduxExtension, reduxDevtools } from "./redux";

const event = (patch: Partial<TraceEvent> = {}): TraceEvent => ({
	id: 1,
	type: "search",
	effect: "latest",
	phase: "start",
	payload: "q",
	...patch,
});

describe("createTraceRecorder", () => {
	it("keeps events in order", () => {
		const recorder = createTraceRecorder();
		recorder(event({ phase: "start" }));
		recorder(event({ phase: "done" }));

		expect(recorder.events.map((e) => e.phase)).toEqual(["start", "done"]);
	});

	it("clear empties the same array", () => {
		const recorder = createTraceRecorder();
		const { events } = recorder;
		recorder(event());
		recorder.clear();

		expect(events).toHaveLength(0);
		expect(recorder.events).toBe(events);
	});

	it("records again after clear", () => {
		const recorder = createTraceRecorder();
		recorder(event());
		recorder.clear();
		recorder(event());

		expect(recorder.events).toHaveLength(1);
	});

	it("records a real bus", async () => {
		const h = createHarness();
		await h.ctx().run(() => 1);

		expect(h.recorder.events.map((e) => e.phase)).toEqual(["start", "done"]);
	});
});

describe("consoleLogger", () => {
	const setup = () => {
		const out = { debug: vi.fn(), error: vi.fn() };
		return { out, log: consoleLogger({ console: out, prefix: ">" }) };
	};

	it("prints one debug line per phase with the payload", () => {
		const { out, log } = setup();
		log(event());

		expect(out.debug).toHaveBeenCalledWith("> search · latest start", "q");
	});

	it("prints errors with console.error and the cause", () => {
		const { out, log } = setup();
		const error = new Error("boom");
		log(event({ phase: "error", error }));

		expect(out.error).toHaveBeenCalledWith("> search · latest error", error);
		expect(out.debug).not.toHaveBeenCalled();
	});

	it("indents children under their parent", () => {
		const { out, log } = setup();
		log(event({ id: 1 }));
		log(event({ id: 2, parent: 1 }));
		log(event({ id: 3, parent: 2 }));
		const lines = out.debug.mock.calls.map((c) => c[0]);

		expect(lines).toEqual([
			"> search · latest start",
			">   search · latest start",
			">     search · latest start",
		]);
	});

	it("keeps the indent for the end of a task", () => {
		const { out, log } = setup();
		log(event({ id: 1 }));
		log(event({ id: 2, parent: 1 }));
		log(event({ id: 2, parent: 1, phase: "done" }));

		expect(out.debug.mock.calls[2]?.[0]).toBe(">   search · latest done");
	});

	it("treats an unknown parent as the root", () => {
		const { out, log } = setup();
		log(event({ id: 5, parent: 99 }));

		expect(out.debug.mock.calls[0]?.[0]).toBe(">   search · latest start");
	});

	it("uses the default prefix", () => {
		const out = { debug: vi.fn(), error: vi.fn() };
		consoleLogger({ console: out })(event());

		expect(out.debug.mock.calls[0]?.[0]).toBe(
			"[nanoeffects] search · latest start",
		);
	});

	it("falls back to the global console", () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
		consoleLogger()(event());

		expect(debug).toHaveBeenCalledTimes(1);
		debug.mockRestore();
	});
});

describe("performanceLogger", () => {
	const setup = () => {
		let now = 0;
		const perf = {
			now: () => now,
			mark: vi.fn(),
			measure: vi.fn(),
		};
		return {
			perf,
			tick: (ms: number) => {
				now += ms;
			},
			log: performanceLogger({ performance: perf }),
		};
	};

	it("records nothing at start", () => {
		const { perf, log } = setup();
		log(event());

		expect(perf.measure).not.toHaveBeenCalled();
		expect(perf.mark).not.toHaveBeenCalled();
	});

	it("measures from start to the end", () => {
		const { perf, log, tick } = setup();
		tick(10);
		log(event());
		tick(25);
		log(event({ phase: "done" }));

		expect(perf.measure).toHaveBeenCalledWith("search · latest (done)", {
			start: 10,
			end: 35,
			detail: { id: 1, phase: "done" },
		});
	});

	it("includes the parent and the error in the detail", () => {
		const { perf, log } = setup();
		log(event({ id: 2, parent: 1 }));
		log(event({ id: 2, parent: 1, phase: "error", error: new Error("boom") }));

		expect(perf.measure.mock.calls[0]?.[1].detail).toEqual({
			id: 2,
			parent: 1,
			phase: "error",
			error: "Error: boom",
		});
	});

	it("measures cancel too", () => {
		const { perf, log } = setup();
		log(event());
		log(event({ phase: "cancel" }));

		expect(perf.measure.mock.calls[0]?.[0]).toBe("search · latest (cancel)");
	});

	it("marks a drop that never started", () => {
		const { perf, log } = setup();
		log(event({ phase: "drop" }));

		expect(perf.mark).toHaveBeenCalledWith("search · latest (drop)", {
			detail: { id: 1, phase: "drop" },
		});
		expect(perf.measure).not.toHaveBeenCalled();
	});

	it("tracks tasks by id", () => {
		const { perf, log, tick } = setup();
		log(event({ id: 1 }));
		tick(5);
		log(event({ id: 2 }));
		tick(5);
		log(event({ id: 1, phase: "done" }));

		expect(perf.measure.mock.calls[0]?.[1]).toMatchObject({
			start: 0,
			end: 10,
		});
	});

	it("forgets a task once it ended", () => {
		const { perf, log } = setup();
		log(event());
		log(event({ phase: "done" }));
		log(event({ phase: "done" }));

		expect(perf.measure).toHaveBeenCalledTimes(1);
		expect(perf.mark).toHaveBeenCalledTimes(1);
	});

	it("does nothing without the Performance API", () => {
		vi.stubGlobal("performance", null);
		try {
			const log = performanceLogger();

			expect(() => {
				log(event());
				log(event({ phase: "done" }));
			}).not.toThrow();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("uses the global performance by default", () => {
		const measure = vi
			.spyOn(performance, "measure")
			.mockImplementation(() => ({}) as PerformanceMeasure);
		const log = performanceLogger();
		log(event());
		log(event({ phase: "done" }));

		expect(measure).toHaveBeenCalledTimes(1);
		measure.mockRestore();
	});
});

describe("reduxDevtools", () => {
	const setup = () => {
		const connection = { init: vi.fn(), send: vi.fn() };
		const extension: ReduxExtension = { connect: vi.fn(() => connection) };
		return {
			connection,
			extension,
			log: reduxDevtools({ extension, name: "app" }),
		};
	};

	it("connects once with the instance name and sends the initial state", () => {
		const { connection, extension } = setup();

		expect(extension.connect).toHaveBeenCalledWith({ name: "app" });
		expect(connection.init).toHaveBeenCalledWith({ running: {} });
	});

	it("uses a default name", () => {
		const connection = { init: vi.fn(), send: vi.fn() };
		const extension: ReduxExtension = { connect: vi.fn(() => connection) };
		reduxDevtools({ extension });

		expect(extension.connect).toHaveBeenCalledWith({ name: "nanoeffects" });
	});

	it("names the action type/effect/phase and keeps the event type", () => {
		const { connection, log } = setup();
		log(event({ id: 3, parent: 1 }));
		const [action] = connection.send.mock.calls[0] ?? [];

		expect(action).toMatchObject({
			type: "search/latest/start",
			event: "search",
			effect: "latest",
			phase: "start",
			id: 3,
			parent: 1,
			payload: "q",
		});
	});

	it("tracks running tasks in the state", () => {
		const { connection, log } = setup();
		log(event({ id: 1 }));
		log(event({ id: 2, type: "save", effect: "leading" }));

		expect(connection.send.mock.calls[1]?.[1]).toEqual({
			running: {
				1: { type: "search", effect: "latest" },
				2: { type: "save", effect: "leading" },
			},
		});
	});

	it.each(["done", "error", "cancel", "drop"] as const)(
		"removes the task from the state on %s",
		(phase) => {
			const { connection, log } = setup();
			log(event());
			log(event({ phase }));

			expect(connection.send.mock.calls[1]?.[1]).toEqual({ running: {} });
		},
	);

	it("sends the error message as a string", () => {
		const { connection, log } = setup();
		log(event({ phase: "error", error: new Error("boom") }));

		expect(connection.send.mock.calls[0]?.[0].error).toBe("boom");
	});

	it("passes a non-Error cause through", () => {
		const { connection, log } = setup();
		log(event({ phase: "error", error: "plain" }));

		expect(connection.send.mock.calls[0]?.[0].error).toBe("plain");
	});

	it("does not add error to other phases", () => {
		const { connection, log } = setup();
		log(event({ phase: "done" }));

		expect(connection.send.mock.calls[0]?.[0]).not.toHaveProperty("error");
	});

	it("sends a snapshot, not the live state", () => {
		const { connection, log } = setup();
		log(event({ id: 1 }));
		const first = connection.send.mock.calls[0]?.[1];
		log(event({ id: 1, phase: "done" }));

		expect(first).toEqual({
			running: { 1: { type: "search", effect: "latest" } },
		});
	});

	it("is a no-op without the extension", () => {
		const log = reduxDevtools();

		expect(() => log(event())).not.toThrow();
	});

	it("finds the extension on globalThis", () => {
		const connection = { init: vi.fn(), send: vi.fn() };
		const global = globalThis as {
			__REDUX_DEVTOOLS_EXTENSION__?: ReduxExtension;
		};
		global.__REDUX_DEVTOOLS_EXTENSION__ = { connect: () => connection };
		try {
			reduxDevtools()(event());

			expect(connection.send).toHaveBeenCalledTimes(1);
		} finally {
			delete global.__REDUX_DEVTOOLS_EXTENSION__;
		}
	});

	it("works end to end on a bus", async () => {
		const connection = { init: vi.fn(), send: vi.fn() };
		const bus = createBus<TestEvents>({
			trace: reduxDevtools({ extension: { connect: () => connection } }),
		});
		bus.on("t", (_, ctx) => ctx.run(() => 1));
		bus.emit("t", 1);
		await Promise.resolve();
		await Promise.resolve();
		const types = connection.send.mock.calls.map((c) => c[0].type);

		expect(types).toEqual(["t/run/start", "t/run/done"]);
	});
});
