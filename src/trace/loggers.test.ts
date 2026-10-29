import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { TraceEvent } from "../core/types";
import { latest } from "../policies";
import { createHarness, type TestEvents } from "../tests/test-helpers";
import { delay } from "../utils";
import { consoleLogger } from "./console";
import { performanceLogger } from "./performance";
import { tracePlugin } from "./plugin";
import { createTraceRecorder } from "./recorder";
import { type ReduxExtension, reduxDevtools } from "./redux";
import { createTracer } from "./tracer";

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

		expect(recorder.events.map((event) => event.phase)).toEqual([
			"start",
			"done",
		]);
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
		const harness = createHarness();
		await harness.ctx().run(() => 1);

		expect(harness.recorder.events.map((event) => event.phase)).toEqual([
			"start",
			"done",
		]);
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
		log(event({ id: 2, parentId: 1 }));
		log(event({ id: 3, parentId: 2 }));
		const lines = out.debug.mock.calls.map((call) => call[0]);

		expect(lines).toEqual([
			"> search · latest start",
			">   search · latest start",
			">     search · latest start",
		]);
	});

	it("keeps the indent for the end of a task", () => {
		const { out, log } = setup();
		log(event({ id: 1 }));
		log(event({ id: 2, parentId: 1 }));
		log(event({ id: 2, parentId: 1, phase: "done" }));

		expect(out.debug.mock.calls[2]?.[0]).toBe(">   search · latest done");
	});

	it("treats an unknown parent as the root", () => {
		const { out, log } = setup();
		log(event({ id: 5, parentId: 99 }));

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
		log(event({ id: 2, parentId: 1 }));
		log(
			event({ id: 2, parentId: 1, phase: "error", error: new Error("boom") }),
		);

		expect(perf.measure.mock.calls[0]?.[1].detail).toEqual({
			id: 2,
			parentId: 1,
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
			log: reduxDevtools({
				extension,
				name: "app",
				policies: true,
				payload: "all",
				starts: true,
				depth: Number.POSITIVE_INFINITY,
			}),
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
		log(event({ id: 3, parentId: 1 }));
		const [action] = connection.send.mock.calls[0] ?? [];

		expect(action).toMatchObject({
			type: "search/latest/start",
			event: "search",
			effect: "latest",
			phase: "start",
			id: 3,
			parentId: 1,
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
			reduxDevtools()(event({ effect: "emit", phase: "done" }));

			expect(connection.send).toHaveBeenCalledTimes(1);
		} finally {
			delete global.__REDUX_DEVTOOLS_EXTENSION__;
		}
	});

	it("works end to end on a bus: the emit, then one action for a stage, when it ends", async () => {
		const connection = { init: vi.fn(), send: vi.fn() };
		const bus = createBus<TestEvents>({
			trace: createTracer(
				reduxDevtools({
					extension: { connect: () => connection },
					policies: true,
				}),
			),
		}).use(tracePlugin());
		bus.on("t", (_, ctx) => ctx.run(() => 1));
		bus.emit("t", 1);
		await Promise.resolve();
		await Promise.resolve();
		const types = connection.send.mock.calls.map((call) => call[0].type);

		expect(types).toEqual(["t", "t/run/done"]);
	});
});

describe("reduxDevtools, quiet by default", () => {
	const setup = (options: Parameters<typeof reduxDevtools>[0] = {}) => {
		const connection = { init: vi.fn(), send: vi.fn() };
		const extension: ReduxExtension = { connect: vi.fn(() => connection) };

		return {
			connection,
			extension,
			// the stages of the handlers are on in these tests; the defaults have their own suite
			log: reduxDevtools({ extension, policies: true, ...options }),
			types: () =>
				connection.send.mock.calls.map(
					([action]) => (action as { type: string }).type,
				),
		};
	};

	it("a task is one action, sent when it ends; the running task is in the state", () => {
		const { connection, log, types } = setup();
		log(event({ id: 1 }));
		expect(connection.send).not.toHaveBeenCalled();
		log(event({ id: 1, phase: "done" }));

		expect(types()).toEqual(["search/latest/done"]);
		expect(connection.send.mock.calls[0]?.[1]).toEqual({ running: {} });
	});

	it("the running tasks are in the state of the next action", () => {
		const { connection, log } = setup();
		log(event({ id: 1 }));
		log(event({ id: 2, type: "save", effect: "leading" }));
		log(event({ id: 2, type: "save", effect: "leading", phase: "done" }));

		expect(connection.send.mock.calls[0]?.[1]).toEqual({
			running: { 1: { type: "search", effect: "latest" } },
		});
	});

	it("depth 1 shows the effects a handler starts, not the attempts under them", () => {
		const { log, types } = setup({ depth: 1 });
		log(event({ id: 1, phase: "start" }));
		log(event({ id: 2, parentId: 1, effect: "retry", phase: "start" }));
		log(event({ id: 3, parentId: 2, effect: "run", phase: "start" }));
		log(event({ id: 3, parentId: 2, effect: "run", phase: "error" }));
		log(event({ id: 2, parentId: 1, effect: "retry", phase: "done" }));
		log(event({ id: 1, phase: "done" }));

		expect(types()).toEqual(["search/retry/done", "search/latest/done"]);
	});

	it("without depth only the handler tasks are shown, a deeper depth shows more", () => {
		const roots = setup();
		const deep = setup({ depth: 2 });
		for (const { log } of [roots, deep]) {
			log(event({ id: 1 }));
			log(event({ id: 2, parentId: 1, effect: "retry" }));
			log(event({ id: 3, parentId: 2, effect: "run" }));
			log(event({ id: 3, parentId: 2, effect: "run", phase: "done" }));
			log(event({ id: 2, parentId: 1, effect: "retry", phase: "done" }));
			log(event({ id: 1, phase: "done" }));
		}

		expect(roots.types()).toEqual(["search/latest/done"]);
		expect(deep.types()).toEqual([
			"search/run/done",
			"search/retry/done",
			"search/latest/done",
		]);
	});

	it("a dropped task that never started is shown by the level of its parent", () => {
		const { log, types } = setup({ depth: 1 });
		log(event({ id: 1 }));
		log(event({ id: 5, parentId: 1, effect: "throttle", phase: "drop" }));

		expect(types()).toEqual(["search/throttle/drop"]);
	});

	it("starts: true sends the start of each shown task", () => {
		const { log, types } = setup({ starts: true });
		log(event({ id: 1 }));
		log(event({ id: 1, phase: "done" }));

		expect(types()).toEqual(["search/latest/start", "search/latest/done"]);
	});

	it("passes maxAge to DevTools only when it is given", () => {
		const given = setup({ maxAge: 500, name: "app" });
		const absent = setup({ name: "app" });

		expect(given.extension.connect).toHaveBeenCalledWith({
			name: "app",
			maxAge: 500,
		});
		expect(absent.extension.connect).toHaveBeenCalledWith({ name: "app" });
	});

	it("forgets the tasks that ended", () => {
		const { connection, log } = setup();
		for (let id = 1; id <= 50; id++) {
			log(event({ id }));
			log(event({ id, phase: "done" }));
		}

		expect(connection.send.mock.calls.at(-1)?.[1]).toEqual({ running: {} });
	});
});

describe("reduxDevtools, the defaults and policies", () => {
	const setup = (options: Parameters<typeof reduxDevtools>[0] = {}) => {
		const connection = { init: vi.fn(), send: vi.fn() };
		const extension: ReduxExtension = { connect: vi.fn(() => connection) };

		return {
			connection,
			log: reduxDevtools({ extension, ...options }),
			types: () =>
				connection.send.mock.calls.map(
					([action]) => (action as { type: string }).type,
				),
		};
	};

	// one call of a `latest` handler that is cancelled, one that ends, one that fails
	const flow = (log: ReturnType<typeof reduxDevtools>) => {
		log(event({ id: 1, effect: "emit", phase: "done" }));
		log(event({ id: 2, parentId: 9 }));
		log(event({ id: 2, parentId: 9, phase: "cancel" }));
		log(event({ id: 3, parentId: 9 }));
		log(event({ id: 4, parentId: 3, effect: "retry" }));
		log(event({ id: 4, parentId: 3, effect: "retry", phase: "done" }));
		log(event({ id: 3, parentId: 9, phase: "done" }));
		log(event({ id: 5, parentId: 9 }));
		log(event({ id: 5, parentId: 9, phase: "error", error: new Error("x") }));
	};

	it("sends the emits and the failed handlers, and nothing else, by default", () => {
		const { log, types } = setup();
		flow(log);

		expect(types()).toEqual(["search", "search/latest/error"]);
	});

	it("keeps the emit action as the event, with its payload and parent", () => {
		const { connection, log } = setup();
		log(event({ id: 7, parentId: 2, effect: "emit", phase: "done" }));

		expect(connection.send.mock.calls[0]?.[0]).toMatchObject({
			type: "search",
			event: "search",
			effect: "emit",
			id: 7,
			parentId: 2,
			payload: "q",
		});
	});

	it("does not put an emit in the running state", () => {
		const { connection, log } = setup({ policies: true, starts: true });
		log(event({ id: 1, effect: "emit", phase: "done" }));

		expect(connection.send.mock.calls[0]?.[1]).toEqual({ running: {} });
	});

	it("policies: true adds every stage of the handler tasks, not the effects", () => {
		const { log, types } = setup({ policies: true });
		flow(log);

		expect(types()).toEqual([
			"search",
			"search/latest/cancel",
			"search/latest/done",
			"search/latest/error",
		]);
	});

	it("policies as a list of phases shows only those, and the failures", () => {
		const { log, types } = setup({ policies: ["cancel", "drop"] });
		flow(log);

		expect(types()).toEqual([
			"search",
			"search/latest/cancel",
			"search/latest/error",
		]);
	});

	it("policies as a function gets the effect and the phase", () => {
		const seen: string[] = [];
		const { log, types } = setup({
			policies: ({ effect, phase }) => {
				seen.push(`${effect}/${phase}`);
				return effect === "latest" && phase === "done";
			},
		});
		flow(log);

		expect(types()).toEqual([
			"search",
			"search/latest/done",
			"search/latest/error",
		]);
		expect(seen).toContain("latest/cancel");
	});

	it("an empty list or a false policy still shows the failures", () => {
		for (const policies of [[], false, () => false] as const) {
			const { log, types } = setup({ policies });
			flow(log);

			expect(types()).toEqual(["search", "search/latest/error"]);
		}
	});

	it("depth works without policies, for the effects below the handlers", () => {
		const { log, types } = setup({ depth: 1 });
		flow(log);

		expect(types()).toEqual([
			"search",
			"search/retry/done",
			"search/latest/error",
		]);
	});

	it("on a real bus: two emits of a latest handler give two actions, and the stages when asked", async () => {
		const run = async (options: Parameters<typeof reduxDevtools>[0]) => {
			const { log, types } = setup(options);
			const bus = createBus<TestEvents>({ trace: createTracer(log) }).use(
				tracePlugin(),
			);
			bus.on(
				"t",
				latest(async (_, ctx) => {
					await ctx.run(() => delay(ctx, 5));
				}),
			);
			bus.emit("t", 1);
			bus.emit("t", 2);
			await vi.advanceTimersByTimeAsync(10);

			return types();
		};
		vi.useFakeTimers();
		try {
			expect(await run({})).toEqual(["t", "t"]);
			expect(await run({ policies: ["cancel"] })).toEqual([
				"t",
				"t",
				"t/latest/cancel",
				// ctx.run in the handler is a task of the listener too, so it is a stage as well
				"t/run/cancel",
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("warns once when a handler task ends and no emit event came before it", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const { log } = setup();
			log(event({ id: 1, parentId: 9 }));
			expect(warn).not.toHaveBeenCalled();
			log(event({ id: 1, parentId: 9, phase: "done" }));
			log(event({ id: 2, parentId: 9, phase: "done" }));

			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0]?.[0]).toContain("tracePlugin");
		} finally {
			warn.mockRestore();
		}
	});

	it("does not warn when an emit came first, or when only an effect below a handler ends", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const withEmit = setup();
			withEmit.log(event({ id: 1, effect: "emit", phase: "done" }));
			withEmit.log(event({ id: 2, parentId: 9, phase: "done" }));
			const below = setup({ depth: 1 });
			below.log(event({ id: 3, parentId: 9 }));
			below.log(event({ id: 4, parentId: 3, effect: "retry", phase: "done" }));

			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});

	describe("payload", () => {
		// one lost call, one that ends, one that fails; the emit of each comes first
		const flow = (log: ReturnType<typeof reduxDevtools>) => {
			log(event({ id: 1, effect: "emit", phase: "done", payload: "a" }));
			log(event({ id: 2, parentId: 9, payload: "a" }));
			log(event({ id: 2, parentId: 9, payload: "a", phase: "cancel" }));
			log(event({ id: 3, effect: "emit", phase: "done", payload: "ab" }));
			log(event({ id: 4, parentId: 9, payload: "ab" }));
			log(event({ id: 4, parentId: 9, payload: "ab", phase: "done" }));
			log(event({ id: 5, effect: "emit", phase: "done", payload: "abc" }));
			log(event({ id: 6, parentId: 9, payload: "abc" }));
			log(
				event({
					id: 6,
					parentId: 9,
					payload: "abc",
					phase: "error",
					error: new Error("x"),
				}),
			);
		};
		const actionsOf = (options: Parameters<typeof reduxDevtools>[0]) => {
			const { connection, log } = setup({
				policies: true,
				starts: true,
				...options,
			});
			flow(log);

			return connection.send.mock.calls.map(
				([action]) => action as Record<string, unknown>,
			);
		};
		const labelOf = (action: Record<string, unknown>) =>
			`${action.type}${"payload" in action ? ` ${action.payload}` : ""}`;

		it("essential, the default, keeps it on the emits and on cancel, drop and error", () => {
			expect(actionsOf({}).map(labelOf)).toEqual([
				"search a",
				"search/latest/start",
				"search/latest/cancel a",
				"search ab",
				"search/latest/start",
				"search/latest/done",
				"search abc",
				"search/latest/start",
				"search/latest/error abc",
			]);
		});

		it("all keeps it everywhere", () => {
			expect(actionsOf({ payload: "all" }).map(labelOf)).toEqual([
				"search a",
				"search/latest/start a",
				"search/latest/cancel a",
				"search ab",
				"search/latest/start ab",
				"search/latest/done ab",
				"search abc",
				"search/latest/start abc",
				"search/latest/error abc",
			]);
		});

		it("none has it nowhere, also not on a lost or failed call", () => {
			const actions = actionsOf({ payload: "none" });

			expect(actions).toHaveLength(9);
			expect(actions.some((action) => "payload" in action)).toBe(false);
		});

		it("changes nothing but the payload: the same actions, in the same order", () => {
			const strip = ({ payload: _, ...rest }: Record<string, unknown>) => rest;
			const all = actionsOf({ payload: "all" }).map(strip);

			expect(actionsOf({}).map(strip)).toEqual(all);
			expect(actionsOf({ payload: "none" }).map(strip)).toEqual(all);
		});

		it("keeps the error, the group and the state with none", () => {
			const { connection, log } = setup({ payload: "none" });
			log(event({ id: 1, parentId: 9, traceGroupId: "flow" }));
			log(
				event({
					id: 1,
					parentId: 9,
					traceGroupId: "flow",
					phase: "error",
					error: new Error("x"),
				}),
			);
			const [action] = connection.send.mock.calls[0] ?? [];

			expect(action).toMatchObject({
				type: "search/latest/error",
				error: "x",
				traceGroupId: "flow",
			});
			expect(action).not.toHaveProperty("payload");
		});

		it("an effect below a handler follows the same rule by its phase", () => {
			const { connection, log } = setup({ depth: 1, starts: true });
			log(event({ id: 1, parentId: 9 }));
			log(event({ id: 2, parentId: 1, effect: "retry" }));
			log(event({ id: 2, parentId: 1, effect: "retry", phase: "done" }));
			const retries = connection.send.mock.calls
				.map(([action]) => action as Record<string, unknown>)
				.filter((action) => action.effect === "retry");

			expect(retries.map((action) => "payload" in action)).toEqual([
				false,
				false,
			]);
		});
	});

	it("the running state holds only the tasks that the options show", () => {
		const { connection, log } = setup({
			policies: ["done"],
			starts: true,
		});
		log(event({ id: 1, parentId: 9 }));
		log(event({ id: 1, parentId: 9, phase: "done" }));

		expect(connection.send.mock.calls[0]?.[1]).toEqual({ running: {} });
	});
});

describe("the group and the root in the loggers", () => {
	it("performanceLogger puts them in the detail, and only when they are set", () => {
		const perf = { now: vi.fn(() => 0), measure: vi.fn(), mark: vi.fn() };
		const log = performanceLogger({ performance: perf });
		log(event({ id: 3 }));
		log(event({ id: 3, rootId: 1, traceGroupId: "checkout", phase: "done" }));
		log(event({ id: 4 }));
		log(event({ id: 4, phase: "done" }));

		expect(perf.measure.mock.calls[0]?.[1].detail).toEqual({
			id: 3,
			parentId: void 0,
			rootId: 1,
			traceGroupId: "checkout",
			phase: "done",
		});
		expect(perf.measure.mock.calls[1]?.[1].detail).toEqual({
			id: 4,
			parentId: void 0,
			phase: "done",
		});
	});

	it("reduxDevtools keeps them in the action, and the group in the running tasks", () => {
		const connection = { init: vi.fn(), send: vi.fn() };
		const extension: ReduxExtension = { connect: vi.fn(() => connection) };
		const log = reduxDevtools({
			extension,
			policies: true,
			starts: true,
			depth: 9,
		});
		log(event({ id: 3, rootId: 1, traceGroupId: "checkout" }));

		const [action, state] = connection.send.mock.calls[0] ?? [];
		expect(action).toMatchObject({ rootId: 1, traceGroupId: "checkout" });
		expect(state.running[3]).toEqual({
			type: "search",
			effect: "latest",
			traceGroupId: "checkout",
		});
	});
});
