import type { Readable } from "svelte/store";
import { describe, expect, it } from "vitest";
import {
	commandsPlugin,
	createAction,
	createCommand,
	createModule,
	emitterPlugin,
	modulePlugin,
} from "../actions";
import { contextPlugin } from "../context";
import { type Bus, createBus } from "../core/bus";
import type { EventMap } from "../core/types";
import { devPlugin } from "../dev";
import { delay, effectsPlugin, race } from "../effects";
import { matchPlugin } from "../match";
import { extendBus } from "../oop";
import { reactPlugin } from "../react";
import { scopePlugin } from "../scope";
import { signalPlugin } from "../signal";
import { sveltePlugin } from "../svelte";
import {
	createTraceRecorder,
	createTracer,
	type Recorder,
	tracePlugin,
} from "../trace";
import { vuePlugin } from "../vue";
import { noPayload } from "./test-helpers";

// Every plugin of the package, in many orders. For each order the bus gets the plugins, and the
// probes below use what each plugin gives. A probe that fails and that the docs do not explain by
// the order is a finding: two plugins that do not live together.

type Name =
	| "context"
	| "effects"
	| "scope"
	| "commands"
	| "modules"
	| "emitter"
	| "match"
	| "signal"
	| "dev"
	| "trace"
	| "react"
	| "svelte"
	| "vue";

const names: Name[] = [
	"context",
	"effects",
	"scope",
	"commands",
	"modules",
	"emitter",
	"match",
	"signal",
	"dev",
	"trace",
	"react",
	"svelte",
	"vue",
];

type Registry = ReturnType<ReturnType<typeof commandsPlugin>>;
type App = ReturnType<ReturnType<typeof modulePlugin>>;

// what the module of the probes saw, and the parts the plugins returned
type Build = {
	order: Name[];
	// what the tracer of the bus saw
	recorder: Recorder;
	bus: Bus<EventMap>;
	messages: string[];
	seen: {
		handler: unknown[];
		spawn: unknown[];
		setup: unknown[];
		predicate: unknown[];
	};
	commands?: Registry;
	app?: App;
	disconnect?: () => void;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const field = (target: unknown, key: string) =>
	typeof target === "object" && target !== null
		? Reflect.get(target, key)
		: void 0;
const storeName = (ctx: unknown) => field(field(ctx, "store"), "name");
const isFunction = (value: unknown) => typeof value === "function";

// resolves with what it saw once the signal of the task aborts
const abortedWith = (ctx: { signal: AbortSignal }, ...before: unknown[]) =>
	new Promise<string>((resolve) => {
		ctx.signal.addEventListener("abort", () => {
			resolve([...before, "aborted"].join());
		});
	});

// `emit` with options, which only the bus of `signalPlugin` types
const emitWith = (bus: Bus<EventMap>, call: unknown, options: unknown) =>
	Reflect.apply(bus.emit, bus, [call, options]) as Promise<string>;

const getValue = createCommand<void, number>("probe/value");

const make = (order: Name[]): Build => {
	const recorder = createTraceRecorder();
	const build: Build = {
		recorder,
		order,
		bus: createBus<EventMap>({ trace: createTracer(recorder) }),
		messages: [],
		seen: { handler: [], spawn: [], setup: [], predicate: [] },
	};
	const probeModule = createModule(
		"probe",
		(moduleContext) => {
			build.seen.setup.push({
				store: storeName(moduleContext),
				delay: isFunction(field(moduleContext, "delay")),
			});
			moduleContext.handle(getValue, () => 42);
			if (order.includes("match")) {
				Reflect.apply(moduleContext.on, moduleContext, [
					(action: { type: string }) => action.type === "p/setup",
					() => build.seen.predicate.push("ran"),
				]);
			}
			moduleContext.on("module/event", (_payload, ctx) => {
				build.seen.handler.push({
					store: storeName(ctx),
					delay: isFunction(field(ctx, "delay")),
					moduleField: field(ctx, "moduleField"),
				});
			});
			moduleContext.spawn(async (_payload, ctx) => {
				await Promise.resolve();
				build.seen.spawn.push({
					store: storeName(ctx),
					delay: isFunction(field(ctx, "delay")),
					moduleField: field(ctx, "moduleField"),
				});
			});
		},
		{ moduleField: "module" },
	);

	for (const name of order) {
		if (name === "context") {
			build.bus.use(contextPlugin({ store: { name: "main" } }));
		} else if (name === "effects") {
			build.bus.use(effectsPlugin({ delay, race }));
		} else if (name === "scope") {
			build.bus.use(scopePlugin());
		} else if (name === "commands") {
			build.commands = build.bus.use(commandsPlugin());
		} else if (name === "modules") {
			build.app = build.bus.use(modulePlugin([probeModule]));
		} else if (name === "emitter") {
			build.bus.use(emitterPlugin());
		} else if (name === "match") {
			build.bus.use(matchPlugin());
		} else if (name === "signal") {
			build.bus.use(signalPlugin());
		} else if (name === "dev") {
			build.disconnect = build.bus.use(
				devPlugin({
					log: (message: string) => build.messages.push(message),
				}),
			);
		} else if (name === "trace") {
			build.bus.use(tracePlugin());
		} else if (name === "react") {
			build.bus.use(reactPlugin());
		} else if (name === "svelte") {
			build.bus.use(sveltePlugin());
		} else {
			build.bus.use(vuePlugin());
		}
	}

	return build;
};

const _before = (order: Name[], first: Name, second: Name) =>
	order.indexOf(first) < order.indexOf(second);

type Probe = {
	id: string;
	needs: Name[];
	run: (build: Build) => boolean | Promise<boolean>;
};

const probes: Probe[] = [
	{
		id: "context fields are on a handler",
		needs: ["context"],
		run: ({ bus }) => {
			const seen: unknown[] = [];
			bus.on("p/context", (_payload, ctx) => {
				seen.push(storeName(ctx));
			});
			bus.emit("p/context");

			return seen[0] === "main";
		},
	},
	{
		id: "effects are bound on a handler",
		needs: ["effects"],
		run: async ({ bus }) => {
			const seen: unknown[] = [];
			bus.on("p/effects", async (_payload, ctx) => {
				await Reflect.apply(field(ctx, "delay") as () => unknown, null, [0]);
				seen.push(isFunction(field(ctx, "race")));
			});
			bus.emit("p/effects");
			await flush();

			return seen[0] === true;
		},
	},
	{
		id: "a command scope reaches its handler, and emit replaces it",
		needs: ["scope"],
		run: ({ bus }) => {
			const read = createCommand(
				"p/scope",
				(_payload: undefined, ctx) => field(ctx, "api"),
				{ api: "own" },
			);

			return (
				bus.emit(read(noPayload)) === "own" &&
				Reflect.apply(bus.emit, bus, [read(noPayload), { api: "other" }]) ===
					"other"
			);
		},
	},
	{
		id: "a scope and the context of the bus are both on a command",
		needs: ["scope", "context"],
		run: ({ bus }) => {
			const read = createCommand(
				"p/both",
				(_payload: undefined, ctx) => [field(ctx, "api"), storeName(ctx)],
				{ api: "own" },
			);

			return bus.emit(read(noPayload)).join() === "own,main";
		},
	},
	{
		id: "a scope effect is bound, and the effects of the bus stay",
		needs: ["scope", "effects"],
		run: ({ bus }) => {
			const echo = (_ctx: { signal: AbortSignal }, value: number) => value;
			const read = createCommand(
				"p/effect",
				(_payload: undefined, ctx) => [
					Reflect.apply(field(ctx, "echo") as (v: number) => number, null, [3]),
					isFunction(field(ctx, "delay")),
				],
				{ $effects: { echo } },
			);

			return bus.emit(read(noPayload)).join() === "3,true";
		},
	},
	{
		id: "a handler bound in the registry answers",
		needs: ["commands"],
		run: ({ bus, commands }) => {
			const ask = createCommand<void, number>("p/registry");
			commands?.handle(ask, () => 7);

			return bus.emit(ask()) === 7;
		},
	},
	{
		id: "the emitter emits an action",
		needs: ["emitter"],
		run: ({ bus }) => {
			const seen: unknown[] = [];
			const note = createAction<number>("p/emitter");
			bus.on(note, (value) => {
				seen.push(value);
			});
			const emitter = field(bus, "emitter") as (
				c: typeof note,
			) => (n: number) => void;
			emitter(note)(5);

			return seen[0] === 5;
		},
	},
	{
		id: "the emitter takes the options of the trace",
		needs: ["emitter"],
		run: ({ bus }) => {
			const seen: unknown[] = [];
			const note = createAction<number>("p/emitter-source");
			bus.on(note, (value) => {
				seen.push(value);
			});
			const emitter = field(bus, "emitter") as (
				c: typeof note,
				options: { traceId: string; traceGroupId: string },
			) => (n: number) => void;
			emitter(note, { traceId: "store", traceGroupId: "flow" })(6);

			return seen[0] === 6;
		},
	},
	{
		id: "a named listener is reported, and off removes it",
		needs: ["trace"],
		run: ({ bus, recorder }) => {
			const seen: unknown[] = [];
			const handler = (value: unknown) => {
				seen.push(value);
			};
			const named = bus.on as unknown as (
				event: string,
				fn: typeof handler,
				options: { traceId: string },
			) => () => void;
			named("p/named", handler, { traceId: "probe-listener" });
			bus.emit("p/named", 1);
			bus.off("p/named", handler);
			bus.emit("p/named", 2);

			return (
				seen.length === 1 &&
				recorder.events.some((event) => event.type === "probe-listener")
			);
		},
	},
	{
		id: "the root of an emitter is reported, and its event is heard",
		needs: ["trace", "emitter"],
		run: ({ bus, recorder }) => {
			const seen: unknown[] = [];
			const note = createAction<number>("p/emitter-root");
			bus.on(note, (value) => {
				seen.push(value);
			});
			const emitter = field(bus, "emitter") as (
				c: typeof note,
				options: { traceId: string },
			) => (n: number) => void;
			emitter(note, { traceId: "probe-root" })(8);

			return (
				seen[0] === 8 &&
				recorder.events.some((event) => event.type === "probe-root")
			);
		},
	},
	{
		id: "the group of a scope is on the events of a command",
		needs: ["trace", "commands"],
		run: async ({ bus, recorder }) => {
			const grouped = createCommand(
				"p/grouped",
				async (_payload: undefined) => 1,
				{ traceGroupId: "probe-group" },
			);
			await bus.emit(grouped(noPayload));

			return recorder.events.some(
				(event) =>
					event.type === "p/grouped" && event.traceGroupId === "probe-group",
			);
		},
	},
	{
		id: "each emit is an event of the trace, also with no listener",
		needs: ["trace"],
		run: ({ bus, recorder }) => {
			bus.emit("p/no-listener", 1);

			return recorder.events.some(
				(event) =>
					event.type === "p/no-listener" &&
					event.effect === "emit" &&
					event.phase === "done",
			);
		},
	},
	{
		id: "a predicate, once and off work",
		needs: ["match"],
		run: ({ bus }) => {
			const matchOn = bus.on as unknown as (
				p: unknown,
				h: unknown,
			) => () => void;
			const seen: string[] = [];
			const picks = (action: { type: string }) =>
				action.type.startsWith("p/pick");
			Reflect.apply(matchOn, bus, [picks, () => seen.push("on")]);
			Reflect.apply(bus.once, bus, [picks, () => seen.push("once")]);
			const removed = () => seen.push("removed");
			Reflect.apply(bus.on, bus, [picks, removed]);
			Reflect.apply(bus.off, bus, [picks, removed]);
			bus.emit("p/pick");
			bus.emit("p/pick");

			return seen.join() === "on,once,on";
		},
	},
	{
		id: "a predicate handler sees the scope of the emit",
		needs: ["match", "scope"],
		run: ({ bus }) => {
			const seen: unknown[] = [];
			Reflect.apply(bus.on, bus, [
				(action: { type: string }) => action.type === "p/scoped",
				(_payload: unknown, ctx: unknown) => seen.push(field(ctx, "api")),
			]);
			const read = createCommand("p/scoped", (_payload: undefined) => 1, {
				api: "own",
			});
			bus.emit(read(noPayload));

			return seen[0] === "own";
		},
	},
	{
		id: "an outside signal aborts the handler of an emit",
		needs: ["signal"],
		run: async ({ bus }) => {
			const read = createCommand("p/signal", (_payload: undefined, ctx) =>
				abortedWith(ctx),
			);
			const controller = new AbortController();
			const result = emitWith(bus, read(noPayload), {
				signal: controller.signal,
			});
			controller.abort();

			return (await result) === "aborted";
		},
	},
	{
		id: "a signal and a scope share the options of an emit",
		needs: ["signal", "scope"],
		run: async ({ bus }) => {
			const read = createCommand("p/signal-scope", (_payload: undefined, ctx) =>
				abortedWith(ctx, field(ctx, "api")),
			);
			const controller = new AbortController();
			const result = emitWith(bus, read(noPayload), {
				api: "own",
				signal: controller.signal,
			});
			controller.abort();

			return (await result) === "own,aborted";
		},
	},
	{
		id: "a signal reaches a handler bound in the registry",
		needs: ["signal", "commands"],
		run: async ({ bus, commands }) => {
			const ask = createCommand<void, Promise<string>>("p/signal-registry");
			commands?.handle(ask, (_payload, ctx) => abortedWith(ctx));
			const controller = new AbortController();
			const result = emitWith(bus, ask(), { signal: controller.signal });
			controller.abort();

			return (await result) === "aborted";
		},
	},
	{
		id: "devPlugin warns once about listeners that pile up",
		needs: ["dev"],
		run: ({ bus, messages }) => {
			for (let index = 0; index < 11; index++) {
				bus.on("p/dev", () => {});
			}
			// held subscriptions are made, and counted, when the modules start
			bus.emit("p/dev");

			return (
				messages.filter((message) => message.includes('"p/dev"')).length === 1
			);
		},
	},
	{
		id: "devPlugin names predicates under * and not under undefined",
		needs: ["dev", "match"],
		run: ({ bus, messages }) => {
			for (let index = 0; index < 11; index++) {
				Reflect.apply(bus.on, bus, [() => false, () => {}]);
			}
			bus.emit("p/dev");

			return (
				messages.some((message) => message.includes('"*"')) &&
				!messages.some((message) => message.includes("undefined"))
			);
		},
	},
	{
		id: "after disconnect the other plugins still work",
		needs: ["dev"],
		run: ({ bus, disconnect, order }) => {
			disconnect?.();
			const seen: string[] = [];
			bus.on("p/after", (_payload, ctx) => {
				seen.push(storeName(ctx) === "main" ? "store" : "plain");
			});
			if (order.includes("match")) {
				Reflect.apply(bus.on, bus, [
					(action: { type: string }) => action.type === "p/after",
					() => seen.push("predicate"),
				]);
			}
			bus.emit("p/after");
			const expected = [order.includes("context") ? "store" : "plain"];
			if (order.includes("match")) {
				expected.push("predicate");
			}

			return seen.join() === expected.join();
		},
	},
	{
		id: "bus.useEmitter is there",
		needs: ["react"],
		run: ({ bus }) => isFunction(field(bus, "useEmitter")),
	},
	{
		id: "bus.watchEmitter and bus.useEventRef are there",
		needs: ["vue"],
		run: ({ bus }) =>
			isFunction(field(bus, "watchEmitter")) &&
			isFunction(field(bus, "useEventRef")),
	},
	{
		id: "bus.eventStore is there and follows an event",
		needs: ["svelte"],
		run: ({ bus }) => {
			const eventStore = field(bus, "eventStore");
			if (!isFunction(eventStore)) {
				return false;
			}

			const store: Readable<unknown> = Reflect.apply(eventStore, bus, [
				"p/store",
				"start",
			]);
			const seen: unknown[] = [];
			const stop = store.subscribe((value: unknown) => seen.push(value));
			bus.emit("p/store", "next");
			stop();

			return seen.join() === "start,next";
		},
	},
	{
		id: "bus.useEventState is there",
		needs: ["react"],
		run: ({ bus }) => isFunction(field(bus, "useEventState")),
	},
	{
		id: "the module is mounted, answers, and unmounts",
		needs: ["modules"],
		run: ({ bus, app, seen }) => {
			bus.emit("module/event");
			const mounted = seen.handler.length === 1;
			const probeModule = !!app?.isMounted;
			app?.dispose();
			bus.emit("module/event");

			return mounted && probeModule && seen.handler.length === 1;
		},
	},
	{
		id: "the module is mounted at the end of the block, with no use of the bus, and sees the plugins",
		needs: ["modules"],
		run: async ({ seen, order }) => {
			await Promise.resolve();
			const [setup] = seen.setup;

			return (
				seen.setup.length === 1 &&
				(!order.includes("context") || field(setup, "store") === "main") &&
				(!order.includes("effects") || field(setup, "delay") === true)
			);
		},
	},
	{
		id: "a module handler sees the context fields of the bus",
		needs: ["modules"],
		run: async ({ bus, seen, order }) => {
			bus.emit("module/event");
			await flush();
			const first = seen.handler[0];

			return (
				(!order.includes("context") || field(first, "store") === "main") &&
				(!order.includes("effects") || field(first, "delay") === true)
			);
		},
	},
	{
		id: "the module task and a spawned task see the context fields of the bus",
		needs: ["modules"],
		run: async ({ bus, seen, order }) => {
			bus.emit("module/event");
			await flush();
			const parts = [seen.setup[0], seen.spawn[0]];

			return parts.every(
				(part) =>
					(!order.includes("context") || field(part, "store") === "main") &&
					(!order.includes("effects") || field(part, "delay") === true),
			);
		},
	},
	{
		id: "the listeners of a module come ahead of the ones registered after the plugin",
		needs: ["modules"],
		run: ({ bus, seen }) => {
			const outside: number[] = [];
			bus.on("module/event", () => {
				outside.push(seen.handler.length);
			});
			bus.emit("module/event");

			return outside[0] === 1;
		},
	},
	{
		id: "a module scope reaches its handler and its spawned task",
		needs: ["modules", "scope"],
		run: async ({ bus, seen }) => {
			bus.emit("module/event");
			await flush();

			return (
				field(seen.handler[0], "moduleField") === "module" &&
				field(seen.spawn[0], "moduleField") === "module"
			);
		},
	},
	{
		id: "a module binds a handler for a command",
		needs: ["modules"],
		run: ({ bus }) => bus.emit(getValue()) === 42,
	},
	{
		id: "an emitter emits an action with a scope",
		needs: ["emitter", "scope"],
		run: ({ bus }) => {
			const seen: unknown[] = [];
			const note = createAction("p/emitter-scope", { api: "own" });
			bus.on(note, (_value, ctx) => {
				seen.push(field(ctx, "api"));
			});
			const emitter = field(bus, "emitter") as (
				c: typeof note,
			) => (n: number) => void;
			emitter(note)(1);

			return seen[0] === "own";
		},
	},
	{
		id: "a predicate is told about an emitted command",
		needs: ["match"],
		run: ({ bus }) => {
			const seen: unknown[] = [];
			Reflect.apply(bus.on, bus, [
				(action: { type: string }) => action.type === "p/command",
				(payload: unknown) => seen.push(payload),
			]);
			const ask = createCommand("p/command", (value: number) => value * 2);

			return bus.emit(ask(4)) === 8 && seen[0] === 4;
		},
	},
	{
		id: "a predicate handler sees the context fields and the effects of the bus",
		needs: ["match"],
		run: async ({ bus, order }) => {
			const seen: unknown[] = [];
			Reflect.apply(bus.on, bus, [
				(action: { type: string }) => action.type === "p/fields",
				(_payload: unknown, ctx: unknown) =>
					seen.push([storeName(ctx), isFunction(field(ctx, "delay"))]),
			]);
			bus.emit("p/fields");
			await flush();
			const expected = [
				order.includes("context") ? "main" : void 0,
				order.includes("effects"),
			];

			return String(seen[0]) === String(expected);
		},
	},
	{
		id: "a class made from the bus has the plugin methods, and dispose ends a predicate subscription",
		needs: ["match", "emitter"],
		run: ({ bus }) => {
			const Service = extendBus(bus, class {});
			const service = new Service();
			const seen: unknown[] = [];
			Reflect.apply(service.on, service, [
				(action: { type: string }) => action.type === "p/class",
				() => seen.push("heard"),
			]);
			bus.emit("p/class");
			service.dispose();
			bus.emit("p/class");

			return isFunction(field(service, "emitter")) && seen.length === 1;
		},
	},
	{
		id: "a scope applies to a command whose handler is in the registry",
		needs: ["scope", "commands"],
		run: ({ bus, commands }) => {
			const ask = createCommand<void, unknown>("p/registry-scope");
			const scoped = createCommand("p/registry-scope", (_p: undefined) => 0, {
				api: "own",
			});
			commands?.handle(scoped, (_payload, ctx) => field(ctx, "api"));
			void ask;

			return String(bus.emit(scoped(noPayload))) === "own";
		},
	},
	{
		id: "a module uses a predicate in its setup",
		needs: ["modules", "match"],
		run: ({ bus, seen }) => {
			bus.emit("p/setup");

			return seen.predicate[0] === "ran";
		},
	},
	{
		id: "devPlugin reports a module that is mounted through the app",
		needs: ["dev", "modules"],
		run: ({ app, messages }) => {
			app?.mount(createModule("reported", () => {}));

			return messages.some((message) => message.includes('"reported"'));
		},
	},
];

const applies = (probe: Probe, order: Name[]) =>
	probe.needs.every((name) => order.includes(name));

const failuresOf = async (order: Name[]) => {
	const failures: string[] = [];
	for (const probe of probes) {
		if (!applies(probe, order)) {
			continue;
		}
		let ok = false;
		try {
			ok = await probe.run(make(order));
		} catch (error) {
			failures.push(`${order.join(" > ")}: ${probe.id} threw ${String(error)}`);
			continue;
		}
		if (!ok) {
			failures.push(`${order.join(" > ")}: ${probe.id}`);
		}
	}

	return failures;
};

// a small deterministic generator, so a failing order can be replayed
const generator = (seed: number) => {
	let state = seed;

	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
};

const shuffled = (random: () => number) => {
	const copy = [...names];
	for (let index = copy.length - 1; index > 0; index--) {
		const other = Math.floor(random() * (index + 1));
		[copy[index], copy[other]] = [copy[other] as Name, copy[index] as Name];
	}

	return copy;
};

describe("the plugins live together", () => {
	it("every plugin alone", async () => {
		const failures: string[] = [];
		for (const name of names) {
			failures.push(...(await failuresOf([name])));
		}

		expect(failures).toEqual([]);
	});

	it("every ordered pair", async () => {
		const failures: string[] = [];
		for (const first of names) {
			for (const second of names) {
				if (first !== second) {
					failures.push(...(await failuresOf([first, second])));
				}
			}
		}

		expect(failures).toEqual([]);
	});

	it("all of them, in 300 orders", { timeout: 60_000 }, async () => {
		const random = generator(7);
		const failures: string[] = [];
		for (let index = 0; index < 300; index++) {
			failures.push(...(await failuresOf(shuffled(random))));
		}

		expect(failures).toEqual([]);
	});
});
