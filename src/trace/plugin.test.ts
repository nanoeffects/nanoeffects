import { describe, expect, it, vi } from "vitest";
import {
	createAction,
	createJob,
	createModule,
	modulePlugin,
} from "../actions";
import { createBus } from "../core/bus";
import type { TraceEvent } from "../core/types";
import { extendBus } from "../oop";
import { latest } from "../policies";
import { noPayload } from "../tests/test-helpers";
import { describeBus } from "./describe";
import { emitFrom } from "./origin";
import { tracePlugin } from "./plugin";
import { createTraceRecorder } from "./recorder";
import { createTracer } from "./tracer";

type Events = { "name/changed": string; other: number };

// lets the promises of the handlers settle
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = () => {
	const recorder = createTraceRecorder();
	const bus = createBus<Events>({ trace: createTracer(recorder) });
	bus.use(tracePlugin());

	return { bus, recorder };
};

describe("tracePlugin", () => {
	it("returns the same bus, with or without a tracer", () => {
		const traced = createBus<Events>({
			trace: createTracer(createTraceRecorder()),
		});
		const plain = createBus<Events>();

		expect(traced.use(tracePlugin())).toBe(traced);
		expect(plain.use(tracePlugin())).toBe(plain);
	});

	it("changes nothing on a bus without a tracer", () => {
		const bus = createBus<Events>();
		const { emit, on, once, off } = bus;
		bus.use(tracePlugin());

		expect([bus.emit, bus.on, bus.once, bus.off]).toEqual([
			emit,
			on,
			once,
			off,
		]);
	});

	describe("the task of an emit", () => {
		it("is marked as a leaf for a logger that watches tasks", () => {
			const leaves: (boolean | undefined)[] = [];
			const logger = Object.assign(() => {}, {
				task: (info: { leaf?: boolean }) => {
					leaves.push(info.leaf);
				},
			});
			const bus = createBus<Events>({ trace: createTracer(logger) });
			bus.use(tracePlugin());
			bus.on("other", () => {});

			bus.emit("other", 1);

			// the leaf of the emit, then the task of the handler
			expect(leaves).toEqual([true, void 0]);
		});
	});

	describe("the emit event", () => {
		const emitEvents = (events: TraceEvent[]) =>
			events.filter((event) => event.effect === "emit");

		it("is reported once for an emit with no listener, before onUnhandled is told", () => {
			const recorder = createTraceRecorder();
			const onUnhandled = vi.fn();
			const bus = createBus<Events>({
				trace: createTracer(recorder),
				onUnhandled,
			}).use(tracePlugin());
			bus.emit("name/changed", "Eva");

			expect(emitEvents(recorder.events)).toMatchObject([
				{ type: "name/changed", phase: "done", payload: "Eva" },
			]);
			expect(onUnhandled).toHaveBeenCalledTimes(1);
		});

		it("is reported for a plain listener that reports nothing", () => {
			const { bus, recorder } = setup();
			bus.on("name/changed", () => {});
			bus.emit("name/changed", "Eva");

			expect(recorder.events.map((event) => event.effect)).toEqual(["emit"]);
		});

		it("takes the payload of an action and the type of an action", async () => {
			const { bus, recorder } = setup();
			const rename = createAction("rename", async (name: string) => name);
			await bus.emit(rename("Eva"));

			expect(emitEvents(recorder.events)).toMatchObject([
				{ type: "rename", payload: "Eva" },
			]);
		});

		it("has the task that emits as its parent", async () => {
			const { bus, recorder } = setup();
			bus.on(
				"name/changed",
				latest((_, ctx) => ctx.emit("other", 1)),
			);
			bus.emit("name/changed", "Eva");
			await settle();
			const policy = recorder.events.find((event) => event.effect === "latest");
			const nested = emitEvents(recorder.events).find(
				(event) => event.type === "other",
			);

			// ctx.emit is the ctx of the listener task, which is also the parent of the policy task
			expect(nested?.parentId).toBe(policy?.parentId);
			expect(nested?.parentId).toBeDefined();
		});

		it("is a child of the root that an emitter makes with traceId", () => {
			const { bus, recorder } = setup();
			bus.on("name/changed", () => {});
			emitFrom(
				bus,
				{ type: "name/changed", payload: "Eva" },
				{ traceId: "Profile" },
			);
			const root = recorder.events.find((event) => event.type === "Profile");
			const emitted = emitEvents(recorder.events);

			expect(emitted).toHaveLength(1);
			expect(emitted[0]?.type).toBe("name/changed");
			expect(emitted[0]?.parentId).toBe(root?.id);
		});

		it("shows the outcomes that a job emits as emits too", async () => {
			const { bus, recorder } = setup();
			const load = createJob("user/load", async (_: undefined) => 1);
			await bus.emit(load(noPayload));
			await settle();

			expect(emitEvents(recorder.events).map((event) => event.type)).toEqual([
				"user/load",
				"user/load/pending",
				"user/load/success",
			]);
		});

		it("carries the group of the call that is emitted", async () => {
			const { bus, recorder } = setup();
			const grouped = createAction("grouped", async (_: undefined) => 1, {
				traceGroupId: "flow",
			});
			await bus.emit(grouped(noPayload));

			expect(emitEvents(recorder.events)[0]?.traceGroupId).toBe("flow");
		});

		it("changes nothing else in the trace and nothing in what emit returns", async () => {
			const run = async (plugin: boolean) => {
				const recorder = createTraceRecorder();
				const bus = createBus<Events>({ trace: createTracer(recorder) });
				if (plugin) {
					bus.use(tracePlugin());
				}
				bus.on(
					"name/changed",
					latest((_, ctx) => ctx.emit("other", 1)),
				);
				bus.on(
					"other",
					latest(async () => {}),
				);
				bus.emit("name/changed", "Eva");
				await settle();

				// ids shift with the extra tasks, so compare the shape: type, effect, phase and the chain of parents
				return recorder.events
					.filter((event) => event.effect !== "emit")
					.map((event) => `${event.type}/${event.effect}/${event.phase}`);
			};

			expect(await run(true)).toEqual(await run(false));
		});

		it("is not reported without the plugin or without a tracer", () => {
			const recorder = createTraceRecorder();
			const bus = createBus<Events>({ trace: createTracer(recorder) });
			bus.on("name/changed", () => {});
			bus.emit("name/changed", "Eva");

			expect(emitEvents(recorder.events)).toEqual([]);
			expect(() =>
				createBus<Events>().use(tracePlugin()).emit("other", 1),
			).not.toThrow();
		});

		it("lets the error of a handler reach the caller", () => {
			const { bus, recorder } = setup();
			bus.on("name/changed", () => {
				throw new Error("boom");
			});

			expect(() => bus.emit("name/changed", "Eva")).toThrow("boom");
			expect(emitEvents(recorder.events)).toHaveLength(1);
		});
	});

	describe("the call that is being emitted", () => {
		it("gives a nested call its own group and puts the outer one back", async () => {
			const { bus, recorder } = setup();
			const payment = createAction("payment", async (_: undefined) => 1, {
				traceGroupId: "payment",
			});
			const plain = createAction("plain", async (_: undefined) => 1);
			const checkout = createAction(
				"checkout",
				async (_: undefined, ctx) => {
					await ctx.emit(payment(noPayload));
					await ctx.emit(plain(noPayload));
				},
				{ traceGroupId: "checkout" },
			);

			await bus.emit(checkout(noPayload));

			const groupOf = (type: string) =>
				recorder.events.find((event) => event.type === type)?.traceGroupId;
			expect(groupOf("payment")).toBe("payment");
			expect(groupOf("plain")).toBe("checkout");
		});

		it("lets the error of a handler reach the caller, and forgets the call", () => {
			const { bus, recorder } = setup();
			bus.on("name/changed", () => {
				throw new Error("boom");
			});
			const grouped = createAction("grouped", async (_: undefined) => 1, {
				traceGroupId: "flow",
			});

			expect(() => bus.emit("name/changed", "Eva")).toThrow("boom");
			bus.actions = {
				run: (action, payload, ctx) =>
					Reflect.apply(action, null, [payload, ctx]),
			};
			bus.emit(createAction("later", async (_: undefined) => 1)(noPayload));
			void grouped;

			const later = recorder.events.find((event) => event.type === "later");
			expect(later?.traceGroupId).toBeUndefined();
		});
	});

	describe("a named listener", () => {
		it("is a task named by its traceId, and an action it emits is below it", async () => {
			const { bus, recorder } = setup();
			const save = createAction("user/save", async (_: undefined) => 1);
			bus.on(
				"name/changed",
				async (_name, ctx) => {
					await ctx.emit(save(noPayload));
				},
				{ traceId: "saveNotifier" },
			);
			bus.on("name/changed", () => {}, { traceId: "auditLog" });

			bus.emit("name/changed", "Eva");
			await settle();

			const named = recorder.events.filter((event) => event.effect === "run");
			expect(named.map((event) => event.type).sort()).toEqual([
				"auditLog",
				"auditLog",
				"saveNotifier",
				"saveNotifier",
			]);
			const notifier = recorder.events.find(
				(event) => event.type === "saveNotifier",
			);
			const action = recorder.events.find(
				(event) => event.type === "user/save",
			);
			expect(action?.parentId).toBe(notifier?.id);
		});

		it("gives the handler the payload and the same context", () => {
			const { bus } = setup();
			const seen: unknown[] = [];
			bus.on(
				"name/changed",
				(payload, ctx) => {
					seen.push(payload, typeof ctx.emit, ctx.type);
				},
				{ traceId: "x" },
			);

			bus.emit("name/changed", "Eva");

			expect(seen).toEqual(["Eva", "function", "name/changed"]);
		});

		it("is removed by off with the handler, and by off of the event", () => {
			const { bus } = setup();
			const handler = vi.fn();
			const other = vi.fn();
			bus.on("name/changed", handler, { traceId: "a" });
			bus.on("other", other, { traceId: "b" });

			bus.off("name/changed", handler);
			bus.emit("name/changed", "Eva");
			expect(handler).not.toHaveBeenCalled();

			bus.off("other");
			bus.emit("other", 1);
			expect(other).not.toHaveBeenCalled();
		});

		it("runs once with once, and is reported once", () => {
			const { bus, recorder } = setup();
			const handler = vi.fn();
			bus.once("name/changed", handler, { traceId: "once" });

			bus.emit("name/changed", "a");
			bus.emit("name/changed", "b");

			expect(handler).toHaveBeenCalledTimes(1);
			expect(
				recorder.events.filter(
					(event) => event.type === "once" && event.phase === "start",
				),
			).toHaveLength(1);
		});

		it("leaves a handler without a traceId as it is, also for off", () => {
			const { bus } = setup();
			const handler = vi.fn();
			bus.on("name/changed", handler);

			bus.off("name/changed", handler);
			bus.emit("name/changed", "Eva");

			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("a listener named by its function", () => {
		const runTypes = (recorder: { events: TraceEvent[] }) =>
			recorder.events
				.filter((event) => event.effect === "run")
				.map((event) => event.type);

		it("is a task named by the function", () => {
			const { bus, recorder } = setup();
			function saveName() {}
			bus.on("name/changed", saveName);

			bus.emit("name/changed", "Eva");

			expect(runTypes(recorder)).toContain("saveName");
		});

		it("leaves an anonymous handler as it is", () => {
			const { bus, recorder } = setup();
			const seen: string[] = [];
			bus.on("name/changed", (name) => {
				seen.push(name);
			});

			bus.emit("name/changed", "Eva");

			expect(seen).toEqual(["Eva"]);
			expect(runTypes(recorder)).toEqual([]);
		});

		it("lets traceId win over the name", () => {
			const { bus, recorder } = setup();
			function saveName() {}
			bus.on("name/changed", saveName, { traceId: "saveNotifier" });

			bus.emit("name/changed", "Eva");

			expect(runTypes(recorder)).toContain("saveNotifier");
			expect(runTypes(recorder)).not.toContain("saveName");
		});

		it("runs a once listener once and removes it with off", () => {
			const { bus } = setup();
			const handler = vi.fn();
			function onceHandler(name: string) {
				handler(name);
			}
			bus.once("name/changed", onceHandler);
			bus.emit("name/changed", "Eva");
			bus.emit("name/changed", "Eva");

			const later = vi.fn();
			function laterHandler() {
				later();
			}
			bus.on("name/changed", laterHandler);
			bus.off("name/changed", laterHandler);
			bus.emit("name/changed", "Eva");

			expect(handler).toHaveBeenCalledTimes(1);
			expect(later).not.toHaveBeenCalled();
		});
	});

	describe("describeBus", () => {
		it("lists the listeners of each event in order", () => {
			const { bus } = setup();
			function saveName() {}
			function audit() {}
			function refresh() {}
			bus.on("name/changed", saveName);
			bus.on("name/changed", audit);
			bus.on("other", refresh, { traceId: "refreshView" });

			expect(describeBus(bus)).toEqual({
				"name/changed": ["saveName", "audit"],
				other: ["refreshView"],
			});
		});

		it("lists an action creator under its type, and an anonymous listener as such", () => {
			const { bus } = setup();
			const rename = createAction<string>("user/rename");
			bus.on(rename, () => {});
			bus.on("*", function everything() {});

			expect(describeBus(bus)).toEqual({
				"user/rename": ["<anonymous>"],
				"*": ["everything"],
			});
		});

		it("forgets a listener that was removed, one that ran once and the returned unsubscribe", () => {
			const { bus } = setup();
			function first() {}
			function second() {}
			function third() {}
			function fourth() {}
			bus.on("name/changed", first);
			bus.on("name/changed", second);
			const unsubscribe = bus.on("other", third);
			bus.once("other", fourth);

			bus.off("name/changed", first);
			unsubscribe();
			bus.emit("other", 1);

			expect(describeBus(bus)).toEqual({ "name/changed": ["second"] });
			bus.off("name/changed");
			expect(describeBus(bus)).toEqual({});
			bus.on("other", third);
			bus.off();
			expect(describeBus(bus)).toEqual({});
		});

		it("is empty without a tracer or without the plugin", () => {
			const plain = createBus<Events>();
			plain.use(tracePlugin());
			plain.on("name/changed", function saveName() {});
			const traced = createBus<Events>({
				trace: createTracer(createTraceRecorder()),
			});
			traced.on("name/changed", function saveName() {});

			expect(describeBus(plain)).toEqual({});
			expect(describeBus(traced)).toEqual({});
		});

		it("holds nothing after many subscribes and unsubscribes", () => {
			const { bus } = setup();
			for (let index = 0; index < 10_000; index += 1) {
				const unsubscribe = bus.on("name/changed", function listener() {});
				unsubscribe();
			}

			expect(describeBus(bus)).toEqual({});
		});
	});

	describe("the source of a listener", () => {
		const withSource = () => {
			const recorder = createTraceRecorder();
			const bus = createBus<Events>({ trace: createTracer(recorder) });
			bus.use(tracePlugin({ source: true }));

			return { bus, recorder };
		};
		const sourcesOf = (recorder: { events: TraceEvent[] }) =>
			recorder.events
				.filter((event) => event.effect === "run")
				.map((event) => event.source);

		it("is the line that called bus.on, for a named listener", () => {
			const { bus, recorder } = withSource();
			function saveName() {}
			bus.on("name/changed", saveName);

			bus.emit("name/changed", "Eva");

			const [first] = sourcesOf(recorder);
			expect(first).toMatch(/plugin\.test\.ts:\d+:\d+$/);
			expect(recorder.events.some((event) => event.type === "saveName")).toBe(
				true,
			);
		});

		it("reports an anonymous listener under its event, with a source", () => {
			const { bus, recorder } = withSource();
			bus.on("name/changed", () => {});

			bus.emit("name/changed", "Eva");

			const run = recorder.events.find((event) => event.effect === "run");
			expect(run?.type).toBe("name/changed");
			expect(run?.source).toMatch(/plugin\.test\.ts:\d+:\d+$/);
		});

		it("is the line of bus.once", () => {
			const { bus, recorder } = withSource();
			bus.once("name/changed", function once() {});

			bus.emit("name/changed", "Eva");
			bus.emit("name/changed", "Eva");

			const runs = recorder.events.filter(
				(event) => event.effect === "run" && event.phase === "done",
			);
			expect(runs).toHaveLength(1);
			expect(runs[0]?.source).toMatch(/plugin\.test\.ts:\d+:\d+$/);
		});

		it("is not recorded by default, and no stack is read", () => {
			const { bus, recorder } = setup();
			const stack = vi.spyOn(Error, "captureStackTrace");
			function saveName() {}
			bus.on("name/changed", saveName);

			bus.emit("name/changed", "Eva");

			expect(sourcesOf(recorder).every((source) => source === void 0)).toBe(
				true,
			);
			expect(stack).not.toHaveBeenCalled();
			stack.mockRestore();
		});

		it("records the source of a listener on an action creator", () => {
			const recorder = createTraceRecorder();
			const bus = createBus({ trace: createTracer(recorder) });
			bus.use(tracePlugin({ source: true }));
			const rename = createAction<string>("user/rename");
			const seen: string[] = [];
			bus.on(rename, (name) => {
				seen.push(name);
			});

			bus.emit(rename("Eva"));

			const run = recorder.events.find((event) => event.effect === "run");
			expect(seen).toEqual(["Eva"]);
			expect(run?.type).toBe("user/rename");
			expect(run?.source).toMatch(/plugin\.test\.ts:\d+:\d+$/);
		});

		it("runs a handler with the same payload and result when the stack is missing", () => {
			const { bus } = withSource();
			const limit = Error.stackTraceLimit;
			Error.stackTraceLimit = 0;
			const handler = vi.fn();
			try {
				bus.on("name/changed", handler);
			} finally {
				Error.stackTraceLimit = limit;
			}

			bus.emit("name/changed", "Eva");

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe("Eva");
		});

		it("is ignored on a bus without a tracer", () => {
			const bus = createBus<Events>();
			const { on } = bus;
			bus.use(tracePlugin({ source: true }));

			expect(bus.on).toBe(on);
		});

		it("is listed by describeBus only when asked", () => {
			const { bus } = withSource();
			function saveName() {}
			bus.on("name/changed", saveName);

			expect(describeBus(bus)).toEqual({ "name/changed": ["saveName"] });
			expect(describeBus(bus, { source: true })["name/changed"]?.[0]).toMatch(
				/^saveName \(.*plugin\.test\.ts:\d+:\d+\)$/,
			);
		});
	});

	describe("with the option off", () => {
		it("runs a handler with an option on a bus without the plugin, with the same result", async () => {
			const bus = createBus<Events>({
				trace: createTracer(createTraceRecorder()),
			});
			const handler = vi.fn(async (name: string) => name);
			bus.on("name/changed", handler, { traceId: "x" });

			bus.emit("name/changed", "Eva");

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe("Eva");
		});

		it("hands the same error to onError as an unnamed listener", async () => {
			const seen: unknown[][] = [];
			for (const options of [void 0, { traceId: "x" }]) {
				const onError = vi.fn();
				const bus = createBus<Events>({
					trace: createTracer(createTraceRecorder()),
					onError,
				});
				bus.use(tracePlugin());
				const failure = new Error("boom");
				bus.on("name/changed", () => Promise.reject(failure), options);
				bus.on(
					"other",
					() => {
						throw failure;
					},
					options,
				);

				bus.emit("name/changed", "Eva");
				bus.emit("other", 1);
				await settle();
				seen.push(onError.mock.calls.map(([error]) => error));
			}

			expect(seen[0]).toEqual(seen[1]);
			expect(seen[1]).toHaveLength(2);
		});

		it("runs a named listener on a bus with the plugin and no tracer, with off working", () => {
			const bus = createBus<Events>();
			bus.use(tracePlugin());
			const handler = vi.fn();
			bus.on("name/changed", handler, { traceId: "x" });

			bus.emit("name/changed", "Eva");
			bus.off("name/changed", handler);
			bus.emit("name/changed", "Adam");

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("finishes a listener when a logger throws", () => {
			const bus = createBus<Events>({
				trace: createTracer(() => {
					throw new Error("logger");
				}),
			});
			vi.spyOn(console, "error").mockImplementation(() => {});
			bus.use(tracePlugin());
			const handler = vi.fn();
			bus.on("name/changed", handler, { traceId: "x" });

			bus.emit("name/changed", "Eva");

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});
});

describe("tracePlugin where listeners are made for you", () => {
	it("names a listener of a module", async () => {
		const recorder = createTraceRecorder();
		const bus = createBus<Events>({ trace: createTracer(recorder) });
		bus.use(tracePlugin());
		const handler = vi.fn();
		bus.use(
			modulePlugin<Events>([
				createModule<Events>("probe", (moduleContext) => {
					moduleContext.on("name/changed", handler, {
						traceId: "moduleListener",
					});
				}),
			]),
		);

		bus.emit("name/changed", "Eva");
		await settle();

		expect(handler).toHaveBeenCalledTimes(1);
		expect(
			recorder.events.some((event) => event.type === "moduleListener"),
		).toBe(true);
	});

	it("names a listener of an instance made by extendBus", () => {
		const recorder = createTraceRecorder();
		const bus = createBus<Events>({ trace: createTracer(recorder) });
		bus.use(tracePlugin());
		const handler = vi.fn();
		const Service = extendBus(bus, class {});
		const service = new Service();
		service.on("name/changed", handler, { traceId: "instanceListener" });

		bus.emit("name/changed", "Eva");

		expect(handler).toHaveBeenCalledTimes(1);
		expect(
			recorder.events.some((event) => event.type === "instanceListener"),
		).toBe(true);
	});
});

describe("tracePlugin in the notrace build", () => {
	it("changes nothing on the bus, and a handler with an option runs as it does without it", async () => {
		// the flag is read when the modules load, so they are loaded again with it off
		vi.stubGlobal("__NANOEFFECTS_TRACE__", false);
		vi.resetModules();
		try {
			const { createBus: freshBus } = await import("../core/bus");
			const { createTraceRecorder: freshRecorder } = await import("./recorder");
			const { createTracer: freshTracer } = await import("./tracer");
			const { tracePlugin: freshPlugin } = await import("./plugin");

			const recorder = freshRecorder();
			const bus = freshBus<Events>({ trace: freshTracer(recorder) });
			const { emit, on, once, off } = bus;
			expect(bus.use(freshPlugin())).toBe(bus);

			expect([bus.emit, bus.on, bus.once, bus.off]).toEqual([
				emit,
				on,
				once,
				off,
			]);
			const handler = vi.fn(async (name: string) => name);
			bus.on("name/changed", handler, { traceId: "x" });
			bus.emit("name/changed", "Eva");
			await settle();

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe("Eva");
			expect(recorder.events).toEqual([]);
		} finally {
			vi.unstubAllGlobals();
			vi.resetModules();
		}
	});
});

describe("tracePlugin in less common places", () => {
	it("names a listener that a handler adds with ctx.on, and ctx.on still ends it with the task", async () => {
		const { bus, recorder } = setup();
		const inner = vi.fn();
		bus.on("other", (_value, ctx) => {
			ctx.on("name/changed", inner, { traceId: "taskListener" });
		});

		bus.emit("other", 1);
		bus.emit("name/changed", "Eva");

		expect(inner).toHaveBeenCalledTimes(1);
		expect(recorder.events.some((event) => event.type === "taskListener")).toBe(
			true,
		);
	});

	it("keeps a policy of a named listener working, below the named node", async () => {
		const { bus, recorder } = setup();
		const finished: string[] = [];
		const signals: AbortSignal[] = [];
		bus.on(
			"name/changed",
			latest(async (name: string, { signal }) => {
				signals.push(signal);
				await new Promise((resolve) => setTimeout(resolve, 5));
				if (!signal.aborted) {
					finished.push(name);
				}
			}),
			{ traceId: "searcher" },
		);

		bus.emit("name/changed", "a");
		bus.emit("name/changed", "b");
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(finished).toEqual(["b"]);
		expect(signals[0]?.aborted).toBe(true);
		const nodes = new Set(
			recorder.events
				.filter((event) => event.type === "searcher")
				.map((event) => event.id),
		);
		const policyRuns = recorder.events.filter(
			(event) => event.effect === "latest",
		);
		expect(nodes.size).toBe(2);
		expect(policyRuns.length).toBeGreaterThan(0);
		// each policy run is a child task of the named node of its own call
		expect(policyRuns.every((event) => nodes.has(Number(event.parentId)))).toBe(
			true,
		);
	});
});
