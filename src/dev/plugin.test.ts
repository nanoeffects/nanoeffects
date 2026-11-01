import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createAction,
	createJob,
	createModule,
	modulePlugin,
} from "../actions";
import { createBus } from "../core/bus";
import { siteOf } from "../core/site";
import { matchPlugin } from "../match";
import { latest } from "../policies";
import type { TestEvents } from "../tests/test-helpers";
import {
	getLostSignalsCount as noopGetLostSignals,
	getLostSignals as noopLostSignals,
	devPlugin as noopPlugin,
} from "./noop";
import { devPlugin, getLostSignals, getLostSignalsCount } from "./plugin";
import type { DevOptions } from "./types";

const setup = (options: DevOptions<TestEvents> = {}) => {
	const messages: string[] = [];
	const bus = createBus<TestEvents>();
	const disconnect = bus.use(
		devPlugin({
			log: (m) => messages.push(m),
			...options,
		}),
	);

	return { bus, messages, disconnect };
};

const subscribe = (
	bus: ReturnType<typeof createBus<TestEvents>>,
	times: number,
) => Array.from({ length: times }, () => bus.on("t", () => {}));

describe("devPlugin: listeners that pile up", () => {
	it("warns once when more than the limit are added, naming the event and the count", () => {
		const { bus, messages } = setup({ maxListeners: 10 });
		subscribe(bus, 11);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('"t"');
		expect(messages[0]).toContain("11");
		expect(messages[0]).toContain("[nanoeffects]");
	});

	it("does not warn again for the same event while it stays above the limit", () => {
		const { bus, messages } = setup({ maxListeners: 10 });
		subscribe(bus, 15);

		expect(messages).toHaveLength(1);
	});

	it("does not count listeners that were unsubscribed", () => {
		const { bus, messages } = setup({ maxListeners: 3 });
		for (let round = 0; round < 20; round++) {
			const off = subscribe(bus, 3);
			for (const stop of off) {
				stop();
			}
		}

		expect(messages).toEqual([]);
	});

	it("counts each event on its own", () => {
		const { bus, messages } = setup({ maxListeners: 2 });
		subscribe(bus, 2);
		bus.on("b", () => {});
		bus.on("b", () => {});

		expect(messages).toEqual([]);
	});

	it("warns again after the count fell to the limit and went over it", () => {
		const { bus, messages } = setup({ maxListeners: 2 });
		const offs = subscribe(bus, 3);
		expect(messages).toHaveLength(1);
		offs[0]?.();
		subscribe(bus, 1);

		expect(messages).toHaveLength(2);
	});

	it("an unsubscribe function called twice counts once", () => {
		const { bus, messages } = setup({ maxListeners: 2 });
		const [first] = subscribe(bus, 2);
		first?.();
		first?.();
		// one is left and two come: 3 is over the limit, which a double count would hide
		subscribe(bus, 2);

		expect(messages).toHaveLength(1);
	});

	it("counts the listeners of every event, also of the ones for all events", () => {
		const { bus, messages } = setup({ maxListeners: 1 });
		bus.on("*", () => {});
		bus.on("*", () => {});

		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('"*"');
	});

	it("counts the subscriptions that a task makes with ctx.on", () => {
		const { bus, messages } = setup({ maxListeners: 2 });
		bus.on("t", (_, ctx) => {
			ctx.on("b", () => {});
		});
		for (let call = 0; call < 3; call++) {
			bus.emit("t", call);
		}

		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('"b"');
	});
});

describe("devPlugin: modules", () => {
	const withApp = (options: DevOptions<TestEvents> = {}) => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin());
		const disconnect = bus.use(
			devPlugin({
				app,
				log: (m) => messages.push(m),
				...options,
			}),
		);

		return { bus, app, messages, disconnect };
	};

	it("reports a first mount", () => {
		const { app, messages } = withApp();
		app.mount(createModule<TestEvents>("user", () => {}));

		expect(messages).toEqual(['[nanoeffects] module "user" mounted']);
	});

	it("reports a replacement by name, and the replacement itself is unchanged", () => {
		const { bus, app, messages } = withApp();
		const calls: string[] = [];
		const version = (label: string) =>
			createModule<TestEvents>("user", (moduleContext) => {
				moduleContext.on("t", () => {
					calls.push(label);
				});
			});
		app.mount(version("old"));
		app.mount(version("new"));
		bus.emit("t", 1);

		expect(messages).toEqual([
			'[nanoeffects] module "user" mounted',
			'[nanoeffects] module "user" replaced',
		]);
		expect(calls).toEqual(["new"]);
	});

	it("reports each module of a call with several, in order, and their unmounts in reverse", () => {
		const { app, messages } = withApp();
		const first = createModule<TestEvents>("first", () => {});
		const second = createModule<TestEvents>("second", () => {});

		const stop = app.mount(first, second);
		stop();

		expect(messages).toEqual([
			'[nanoeffects] module "first" mounted',
			'[nanoeffects] module "second" mounted',
			'[nanoeffects] module "second" unmounted',
			'[nanoeffects] module "first" unmounted',
		]);
	});

	it("reports the unmount of several modules through app.unmount", () => {
		const { app, messages } = withApp();
		const first = createModule<TestEvents>("first", () => {});
		const second = createModule<TestEvents>("second", () => {});
		app.mount(first, second);
		messages.length = 0;

		app.unmount(first, second);

		expect(messages).toEqual([
			'[nanoeffects] module "second" unmounted',
			'[nanoeffects] module "first" unmounted',
		]);
	});

	it("reports an unmount, through app.unmount and through the returned function", () => {
		const { app, messages } = withApp();
		const first = createModule<TestEvents>("first", () => {});
		const second = createModule<TestEvents>("second", () => {});
		app.mount(first);
		const unmountSecond = app.mount(second);
		app.unmount(first);
		unmountSecond();

		expect(messages).toEqual([
			'[nanoeffects] module "first" mounted',
			'[nanoeffects] module "second" mounted',
			'[nanoeffects] module "first" unmounted',
			'[nanoeffects] module "second" unmounted',
		]);
	});

	it("says nothing when the same module is mounted again, and about a module that is not mounted", () => {
		const { app, messages } = withApp();
		const module = createModule<TestEvents>("user", () => {});
		app.mount(module);
		app.mount(module);
		app.unmount(createModule<TestEvents>("other", () => {}));

		expect(messages).toEqual(['[nanoeffects] module "user" mounted']);
	});

	it("a module that is mounted again after it was unmounted is a mount, not a replacement", () => {
		const { app, messages } = withApp();
		const first = createModule<TestEvents>("user", () => {});
		app.mount(first);
		app.unmount(first);
		app.mount(createModule<TestEvents>("user", () => {}));

		expect(messages.filter((message) => message.includes("replaced"))).toEqual(
			[],
		);
		expect(
			messages.filter((message) => message.includes("mounted")),
		).toHaveLength(3);
	});
});

describe("devPlugin: options", () => {
	it("leaks: false checks no listeners, but reports modules", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin());
		bus.use(
			devPlugin({
				app,
				leaks: false,
				maxListeners: 1,
				log: (m) => messages.push(m),
			}),
		);
		subscribe(bus, 5);
		app.mount(createModule<TestEvents>("user", () => {}));

		expect(messages).toEqual(['[nanoeffects] module "user" mounted']);
	});

	it("modules: false reports no modules, but checks listeners", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin());
		bus.use(
			devPlugin({
				app,
				modules: false,
				maxListeners: 1,
				log: (m) => messages.push(m),
			}),
		);
		app.mount(createModule<TestEvents>("user", () => {}));
		subscribe(bus, 2);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain("listeners");
	});

	it("without app only the listeners are checked", () => {
		const { bus, messages } = setup({ maxListeners: 1 });
		subscribe(bus, 2);

		expect(messages).toHaveLength(1);
	});

	it("sends the messages to log, and writes nothing to the console", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin());
		bus.use(devPlugin({ app, maxListeners: 1, log: (m) => messages.push(m) }));
		subscribe(bus, 2);
		app.mount(createModule<TestEvents>("user", () => {}));

		expect(messages).toHaveLength(2);
		expect(warn).not.toHaveBeenCalled();
		expect(info).not.toHaveBeenCalled();
		warn.mockRestore();
		info.mockRestore();
	});

	it("writes to the console by default: a warning for listeners, info for modules", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin());
		bus.use(devPlugin({ app, maxListeners: 1 }));
		subscribe(bus, 2);
		app.mount(createModule<TestEvents>("user", () => {}));

		expect(warn).toHaveBeenCalledTimes(1);
		expect(info).toHaveBeenCalledTimes(1);
		warn.mockRestore();
		info.mockRestore();
	});
});

describe("devPlugin: disconnect", () => {
	it("restores bus.on and the app, and reports nothing afterwards", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin());
		const { on } = bus;
		const { mount, unmount } = app;
		const disconnect = bus.use(
			devPlugin({
				app,
				maxListeners: 1,
				log: (m) => messages.push(m),
			}),
		);
		expect(bus.on).not.toBe(on);
		disconnect();

		expect(bus.on).toBe(on);
		expect(app.mount).toBe(mount);
		expect(app.unmount).toBe(unmount);
		subscribe(bus, 5);
		app.mount(createModule<TestEvents>("user", () => {}));
		expect(messages).toEqual([]);
	});

	it("disconnecting twice does no harm", () => {
		const { disconnect } = setup();

		expect(() => {
			disconnect();
			disconnect();
		}).not.toThrow();
	});
});

describe("devPlugin: behavior is unchanged", () => {
	it("a connected bus delivers events and unsubscribes as a bus does", () => {
		const { bus } = setup();
		const seen: number[] = [];
		const off = bus.on("t", (value) => {
			seen.push(value);
		});
		bus.emit("t", 1);
		off();
		bus.emit("t", 2);

		expect(seen).toEqual([1]);
	});

	it("off(event, fn) still removes the listener", () => {
		const { bus } = setup();
		const handler = vi.fn();
		bus.on("t", handler);
		bus.off("t", handler);
		bus.emit("t", 1);

		expect(handler).not.toHaveBeenCalled();
	});

	it("a connected app mounts, replaces and unmounts modules as before", () => {
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin());
		bus.use(devPlugin({ app, log: () => {} }));
		const seen: string[] = [];
		const version = (label: string) =>
			createModule<TestEvents>("user", (moduleContext) => {
				moduleContext.on("t", () => {
					seen.push(label);
				});
			});
		const first = version("old");
		app.mount(first);
		app.mount(version("new"));
		bus.emit("t", 1);

		expect(seen).toEqual(["new"]);
		expect(app.isMounted(first)).toBe(false);
	});
});

describe("the production build of devPlugin", () => {
	it("returns a function that does nothing and leaves bus.on and the app untouched", () => {
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin());
		const { on } = bus;
		const { mount, unmount } = app;
		const disconnect = bus.use(
			noopPlugin({ app, maxListeners: 1, log: () => {} }),
		);
		subscribe(bus, 5);

		expect(bus.on).toBe(on);
		expect(app.mount).toBe(mount);
		expect(app.unmount).toBe(unmount);
		expect(disconnect()).toBeUndefined();
	});
});

describe("devPlugin and matchPlugin: any order", () => {
	const always = () => true;
	const handler = () => {};

	// devPlugin first or second; the bus that comes out has both
	const connect = (order: "match first" | "dev first") => {
		const messages: string[] = [];
		const raw = createBus<TestEvents>();
		const devOptions = { log: (message: string) => messages.push(message) };
		let disconnect = () => {};
		const withMatch = () => raw.use(matchPlugin());
		if (order === "match first") {
			const bus = withMatch();
			disconnect = bus.use(devPlugin(devOptions));
			return { bus, messages, disconnect };
		}
		disconnect = raw.use(devPlugin(devOptions));
		const bus = withMatch();

		return { bus, messages, disconnect };
	};

	for (const order of ["match first", "dev first"] as const) {
		describe(order, () => {
			it('counts predicate subscriptions once, under "*"', () => {
				const { bus, messages } = connect(order);
				for (let index = 0; index < 11; index++) {
					bus.on(always, handler);
				}

				expect(messages).toHaveLength(1);
				expect(messages[0]).toContain('"*"');
				expect(messages[0]).toContain("11");
				expect(messages[0]).not.toContain("undefined");
			});

			it("counts them out again when they are unsubscribed", () => {
				const { bus, messages } = connect(order);
				const unbinds = Array.from({ length: 11 }, () =>
					bus.on(always, handler),
				);
				messages.length = 0;
				for (const unbind of unbinds) {
					unbind();
				}
				for (let index = 0; index < 10; index++) {
					bus.on(always, handler);
				}

				expect(messages).toEqual([]);
			});

			it("leaves predicates, once and off working after disconnect", () => {
				const { bus, disconnect } = connect(order);
				disconnect();
				const seen: string[] = [];
				bus.on(always, () => {
					seen.push("on");
				});
				bus.once(always, () => {
					seen.push("once");
				});
				const removed = vi.fn();
				bus.on(always, removed);
				bus.off(always, removed);

				bus.emit("t", 1);

				expect(seen).toEqual(["on", "once"]);
				expect(removed).not.toHaveBeenCalled();
			});

			it("reports no more after disconnect", () => {
				const { bus, messages, disconnect } = connect(order);
				disconnect();
				for (let index = 0; index < 15; index++) {
					bus.on("t", handler);
				}

				expect(messages).toEqual([]);
			});
		});
	}

	it("puts bus.on back as it was when nothing wraps it after", () => {
		const bus = createBus<TestEvents>();
		const before = bus.on;
		const disconnect = bus.use(devPlugin({ log: () => {} }));

		disconnect();

		expect(bus.on).toBe(before);
	});
});

describe("devPlugin: the app of the bus", () => {
	const mountOne = (app: {
		mount: (module: ReturnType<typeof first>) => unknown;
	}) => app.mount(first());
	const first = () => createModule<TestEvents>("user", () => {});

	it("finds the app of a modulePlugin used before it", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin<TestEvents>());
		bus.use(devPlugin({ log: (m) => messages.push(m) }));
		mountOne(app);

		expect(messages).toEqual(['[nanoeffects] module "user" mounted']);
	});

	it("finds the app of a modulePlugin used after it", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		bus.use(devPlugin({ log: (m) => messages.push(m) }));
		const app = bus.use(modulePlugin<TestEvents>());
		mountOne(app);

		expect(Reflect.get(bus, "app")).toBe(app);
		expect(messages).toEqual(['[nanoeffects] module "user" mounted']);
	});

	it("takes the app option over the slot", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = bus.use(modulePlugin<TestEvents>());
		bus.use(devPlugin({ app, log: (m) => messages.push(m) }));
		mountOne(app);

		expect(messages).toHaveLength(1);
	});

	it("stops reporting on disconnect, also before the app exists", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const disconnect = bus.use(devPlugin({ log: (m) => messages.push(m) }));
		disconnect();
		const app = bus.use(modulePlugin<TestEvents>());
		const original = app.mount;
		mountOne(app);

		expect(messages).toEqual([]);
		expect(app.mount).toBe(original);
		expect(Reflect.get(bus, "app")).toBe(app);
	});

	it("stops reporting on disconnect after the app was found", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const disconnect = bus.use(devPlugin({ log: (m) => messages.push(m) }));
		const app = bus.use(modulePlugin<TestEvents>());
		mountOne(app);
		disconnect();
		app.mount(createModule<TestEvents>("other", () => {}));

		expect(messages).toEqual(['[nanoeffects] module "user" mounted']);
	});
});

describe("devPlugin: where a named listener was made", () => {
	it("notes the site of a listener with a traceId, and drops it when it is unsubscribed", () => {
		const bus = createBus<{ a: number }>();
		bus.use(devPlugin({ log: () => {} }));

		const off = bus.on("a", () => {}, { traceId: "noted" });
		expect(siteOf("noted")).toContain("plugin.test.ts");

		off();
		expect(siteOf("noted")).toBeUndefined();
	});

	it("keeps the note while one of two listeners with the name is still subscribed", () => {
		const bus = createBus<{ a: number }>();
		bus.use(devPlugin({ log: () => {} }));

		const first = bus.on("a", () => {}, { traceId: "twice" });
		const second = bus.on("a", () => {}, { traceId: "twice" });
		first();

		expect(siteOf("twice")).toBeDefined();
		second();
		expect(siteOf("twice")).toBeUndefined();
	});

	it("notes nothing for a listener with no traceId", () => {
		const bus = createBus<{ a: number }>();
		bus.use(devPlugin({ log: () => {} }));

		bus.on("a", () => {});

		expect(siteOf("a")).toBeUndefined();
	});

	it("notes nothing after disconnect", () => {
		const bus = createBus<{ a: number }>();
		const disconnect = bus.use(devPlugin({ log: () => {} }));
		disconnect();

		bus.on("a", () => {}, { traceId: "late" });

		expect(siteOf("late")).toBeUndefined();
	});
});

describe("devPlugin: a handler that ignores the signal", () => {
	type Events = { search: string; results: string; other: number };

	const make = (options: DevOptions<Events> = {}) => {
		const messages: string[] = [];
		const bus = createBus<Events>();
		const disconnect = bus.use(
			devPlugin({ log: (message) => messages.push(message), ...options }),
		);

		return { bus, messages, disconnect };
	};

	const later = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));

	it("warns once when a latest handler emits after a newer call aborted it", async () => {
		const { bus, messages } = make();
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				// the request ignores ctx.signal, so it runs to the end after the abort
				await later(10);
				ctx.emit("results", query);
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");
		bus.emit("search", "abc");
		await later(40);

		const warnings = messages.filter((message) =>
			message.includes("after its task was aborted"),
		);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('"search"');
		expect(warnings[0]).toContain('"results"');
		expect(warnings[0]).toContain("ctx.signal");
	});

	it("warns once when a handler subscribes with ctx.on after it was aborted", async () => {
		const { bus, messages } = make();
		bus.on(
			"search",
			latest(async (_query: string, ctx) => {
				await later(10);
				ctx.on("other", () => {});
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");
		await later(40);

		const warnings = messages.filter((message) =>
			message.includes("subscribed to"),
		);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('"other"');
	});

	it("is quiet when the handler stops with its signal", async () => {
		const { bus, messages } = make();
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				await later(10);
				if (ctx.signal.aborted) {
					return;
				}
				ctx.emit("results", query);
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");
		await later(40);

		expect(messages.filter((message) => message.includes("aborted"))).toEqual(
			[],
		);
	});

	it("is quiet for a handler that was not aborted", async () => {
		const { bus, messages } = make();
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				await later(5);
				ctx.emit("results", query);
			}),
		);

		bus.emit("search", "a");
		await later(30);

		expect(messages).toEqual([]);
	});

	it("is off with abandoned: false", async () => {
		const { bus, messages } = make({ abandoned: false });
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				await later(10);
				ctx.emit("results", query);
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");
		await later(40);

		expect(messages).toEqual([]);
	});

	it("does not warn for the cancel that createJob emits itself", async () => {
		const { bus, messages } = make();
		const cancel = createAction<number>("work/cancel");
		const work = createJob(
			"work",
			async (_n: number, ctx) => {
				await later(20);
				return ctx.signal.aborted;
			},
			{ cancel },
		);
		bus.on(work, () => {});

		const first = bus.emit(work(1));
		bus.emit(work(2));
		await Promise.allSettled([first]);
		await later(40);

		expect(messages.filter((message) => message.includes("aborted"))).toEqual(
			[],
		);
	});

	it("stops after disconnect", async () => {
		const { bus, messages, disconnect } = make();
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				await later(10);
				ctx.emit("results", query);
			}),
		);
		disconnect();

		bus.emit("search", "a");
		bus.emit("search", "ab");
		await later(40);

		expect(messages).toEqual([]);
	});

	it("the production build does nothing", () => {
		const bus = createBus<Events>();
		const original = bus.addContext;

		bus.use(noopPlugin());

		expect(bus.addContext).toBe(original);
	});
});

describe("getLostSignalsCount", () => {
	type Events = { search: string; results: string; other: number };

	const make = (options: DevOptions<Events> = {}) => {
		const bus = createBus<Events>();
		bus.use(devPlugin({ log: () => {}, ...options }));

		return bus;
	};

	const later = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));

	it("counts the emits that handlers made after they were cancelled", async () => {
		const bus = make();
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				// the request ignores ctx.signal, so it runs to the end after the abort
				await later(10);
				ctx.emit("results", query);
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");
		bus.emit("search", "abc");

		expect(await getLostSignalsCount(bus, { wait: 40 })).toBe(2);
	});

	it("counts nothing for a handler that stops with its signal", async () => {
		const bus = make();
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				await later(10);
				if (!ctx.signal.aborted) {
					ctx.emit("results", query);
				}
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");

		expect(await getLostSignalsCount(bus, { wait: 40 })).toBe(0);
	});

	it("lists what was lost: the kind, the handler and the event", async () => {
		const bus = make();
		bus.on(
			"search",
			latest(async (_query: string, ctx) => {
				await later(10);
				ctx.emit("results", "late");
				ctx.on("other", () => {});
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");

		expect(await getLostSignals(bus, { wait: 40 })).toEqual([
			{ kind: "emit", handler: "search", event: "results" },
			{ kind: "on", handler: "search", event: "other" },
		]);
	});

	it("counts a lost emit every time, while the warning is written once", async () => {
		const messages: string[] = [];
		const bus = make({ log: (message) => messages.push(message) });
		bus.on(
			"search",
			latest(async (_query: string, ctx) => {
				await later(10);
				ctx.emit("results", "one");
				ctx.emit("results", "two");
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");

		expect(await getLostSignalsCount(bus, { wait: 40 })).toBe(2);
		expect(
			messages.filter((message) => message.includes("aborted")),
		).toHaveLength(1);
	});

	it("is 0 when nothing was cancelled", async () => {
		const bus = make();
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				await later(5);
				ctx.emit("results", query);
			}),
		);

		bus.emit("search", "a");

		expect(await getLostSignalsCount(bus, { wait: 30 })).toBe(0);
	});

	it("says what to do when the bus has no devPlugin, or the check is off", async () => {
		await expect(getLostSignalsCount(createBus<Events>())).rejects.toThrow(
			"devPlugin",
		);
		await expect(
			getLostSignalsCount(make({ abandoned: false })),
		).rejects.toThrow("devPlugin");
	});

	it("keeps counting separately for each bus", async () => {
		const first = make();
		const second = make();
		first.on(
			"search",
			latest(async (_query: string, ctx) => {
				await later(10);
				ctx.emit("results", "late");
			}),
		);

		first.emit("search", "a");
		first.emit("search", "ab");

		expect(await getLostSignalsCount(first, { wait: 40 })).toBe(1);
		expect(await getLostSignalsCount(second)).toBe(0);
	});

	it("the production build counts nothing", async () => {
		const bus = createBus<Events>();
		bus.use(noopPlugin());

		expect(await noopGetLostSignals()).toBe(0);
		expect(await noopLostSignals()).toEqual([]);
	});
});

describe("devPlugin: the requests of a handler", () => {
	type Events = { search: string; results: string };

	// a server that answers when it is told to, and stops when the signal of the request aborts
	const serve = () => {
		const calls: Array<{
			url: string;
			signal: AbortSignal | undefined;
			answer: () => void;
		}> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
			return new Promise((resolve, reject) => {
				const signal = init?.signal ?? void 0;
				calls.push({
					url: String(input),
					signal,
					answer: () => resolve(new Response("[]")),
				});
				signal?.addEventListener("abort", () => reject(signal.reason));
			});
		});

		return calls;
	};

	const later = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));

	const make = (options: DevOptions<Events> = {}) => {
		const messages: string[] = [];
		const bus = createBus<Events>();
		const disconnect = bus.use(
			devPlugin({ log: (message) => messages.push(message), ...options }),
		);

		return { bus, messages, disconnect };
	};

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("counts a request with no signal that kept running after the cancel", async () => {
		serve();
		const { bus, messages, disconnect } = make();
		bus.on(
			"search",
			latest(async (query: string) => {
				await fetch(`/api?q=${query}`);
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");

		expect(await getLostSignals(bus, { wait: 20 })).toEqual([
			{ kind: "request", handler: "search", event: "/api?q=a" },
		]);
		expect(
			messages.filter((message) => message.includes("kept running")),
		).toHaveLength(1);
		disconnect();
	});

	it("counts nothing when the request gets the signal of the task", async () => {
		serve();
		const { bus, disconnect } = make();
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				await fetch(`/api?q=${query}`, { signal: ctx.signal }).catch(() => {});
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");

		expect(await getLostSignalsCount(bus, { wait: 20 })).toBe(0);
		disconnect();
	});

	it("counts a request with a signal that is not the task's", async () => {
		serve();
		const { bus, disconnect } = make();
		bus.on(
			"search",
			latest(async (query: string) => {
				await fetch(`/api?q=${query}`, {
					signal: new AbortController().signal,
				});
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");

		expect(await getLostSignalsCount(bus, { wait: 20 })).toBe(1);
		disconnect();
	});

	it("counts nothing for a request that finished before the cancel", async () => {
		const calls = serve();
		const { bus, disconnect } = make();
		bus.on(
			"search",
			latest(async (query: string) => {
				await fetch(`/api?q=${query}`);
			}),
		);

		bus.emit("search", "a");
		await later(5);
		calls[0]?.answer();
		await later(5);
		bus.emit("search", "ab");

		expect(await getLostSignalsCount(bus, { wait: 20 })).toBe(0);
		disconnect();
	});

	it("follows a request that comes after an await, in a later step", async () => {
		const calls = serve();
		const { bus, disconnect } = make();
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				await fetch(`/first?q=${query}`, { signal: ctx.signal });
				await fetch(`/second?q=${query}`);
			}),
		);

		bus.emit("search", "a");
		await later(5);
		calls[0]?.answer();
		await later(5);
		bus.emit("search", "ab");

		expect(
			(await getLostSignals(bus, { wait: 20 })).map((lost) => lost.event),
		).toEqual(["/second?q=a"]);
		disconnect();
	});

	it("counts a request that a stale handler starts after it was cancelled", async () => {
		const calls = serve();
		const { bus, disconnect } = make();
		bus.on(
			"search",
			latest(async (query: string) => {
				await fetch(`/first?q=${query}`);
				await fetch(`/late?q=${query}`);
			}),
		);

		bus.emit("search", "a");
		await later(5);
		bus.emit("search", "ab");
		calls[0]?.answer();

		expect(
			(await getLostSignals(bus, { wait: 20 })).map((lost) => lost.event),
		).toContain("/late?q=a");
		disconnect();
	});

	it("does not attribute a request of the caller, made after bus.emit returned", async () => {
		serve();
		const { bus, disconnect } = make();
		bus.on(
			"search",
			latest(async () => {
				await later(5);
			}),
		);

		bus.emit("search", "a");
		void fetch("/from-the-test");
		bus.emit("search", "ab");

		expect(await getLostSignalsCount(bus, { wait: 20 })).toBe(0);
		disconnect();
	});

	it("is off with requests: false", async () => {
		serve();
		const { bus, disconnect } = make({ requests: false });
		const original = globalThis.fetch;
		bus.on(
			"search",
			latest(async (query: string) => {
				await fetch(`/api?q=${query}`);
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");

		expect(await getLostSignalsCount(bus, { wait: 20 })).toBe(0);
		expect(globalThis.fetch).toBe(original);
		disconnect();
	});

	it("puts fetch back on disconnect", () => {
		serve();
		const before = globalThis.fetch;
		const { disconnect } = make();

		expect(globalThis.fetch).not.toBe(before);
		disconnect();

		expect(globalThis.fetch).toBe(before);
	});

	it("keeps the requests of two buses apart", async () => {
		serve();
		const first = make();
		const second = make();
		first.bus.on(
			"search",
			latest(async (query: string) => {
				await fetch(`/api?q=${query}`);
			}),
		);

		first.bus.emit("search", "a");
		first.bus.emit("search", "ab");

		expect(await getLostSignalsCount(first.bus, { wait: 20 })).toBe(1);
		expect(await getLostSignalsCount(second.bus)).toBe(0);
		second.disconnect();
		first.disconnect();
	});
});
