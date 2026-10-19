import { describe, expect, it, vi } from "vitest";
import { createModule, registerModules } from "../actions";
import { createBus } from "../core/bus";
import type { TestEvents } from "../tests/test-helpers";
import { connectDev } from "./connect";
import { connectDev as connectNoop } from "./noop";
import type { DevOptions } from "./types";

const setup = (options: DevOptions<TestEvents> = {}) => {
	const messages: string[] = [];
	const bus = createBus<TestEvents>();
	const disconnect = connectDev(bus, {
		log: (m) => messages.push(m),
		...options,
	});

	return { bus, messages, disconnect };
};

const subscribe = (
	bus: ReturnType<typeof createBus<TestEvents>>,
	times: number,
) => Array.from({ length: times }, () => bus.on("t", () => {}));

describe("connectDev: listeners that pile up", () => {
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

describe("connectDev: modules", () => {
	const withApp = (options: DevOptions<TestEvents> = {}) => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = registerModules(bus);
		const disconnect = connectDev(bus, {
			app,
			log: (m) => messages.push(m),
			...options,
		});

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

describe("connectDev: options", () => {
	it("leaks: false checks no listeners, but reports modules", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = registerModules(bus);
		connectDev(bus, {
			app,
			leaks: false,
			maxListeners: 1,
			log: (m) => messages.push(m),
		});
		subscribe(bus, 5);
		app.mount(createModule<TestEvents>("user", () => {}));

		expect(messages).toEqual(['[nanoeffects] module "user" mounted']);
	});

	it("modules: false reports no modules, but checks listeners", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = registerModules(bus);
		connectDev(bus, {
			app,
			modules: false,
			maxListeners: 1,
			log: (m) => messages.push(m),
		});
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
		const app = registerModules(bus);
		connectDev(bus, { app, maxListeners: 1, log: (m) => messages.push(m) });
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
		const app = registerModules(bus);
		connectDev(bus, { app, maxListeners: 1 });
		subscribe(bus, 2);
		app.mount(createModule<TestEvents>("user", () => {}));

		expect(warn).toHaveBeenCalledTimes(1);
		expect(info).toHaveBeenCalledTimes(1);
		warn.mockRestore();
		info.mockRestore();
	});
});

describe("connectDev: disconnect", () => {
	it("restores bus.on and the app, and reports nothing afterwards", () => {
		const messages: string[] = [];
		const bus = createBus<TestEvents>();
		const app = registerModules(bus);
		const { on } = bus;
		const { mount, unmount } = app;
		const disconnect = connectDev(bus, {
			app,
			maxListeners: 1,
			log: (m) => messages.push(m),
		});
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

describe("connectDev: behavior is unchanged", () => {
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
		const app = registerModules(bus);
		connectDev(bus, { app, log: () => {} });
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

describe("the production build of connectDev", () => {
	it("returns a function that does nothing and leaves bus.on and the app untouched", () => {
		const bus = createBus<TestEvents>();
		const app = registerModules(bus);
		const { on } = bus;
		const { mount, unmount } = app;
		const disconnect = connectNoop(bus, {
			app,
			maxListeners: 1,
			log: () => {},
		});
		subscribe(bus, 5);

		expect(bus.on).toBe(on);
		expect(app.mount).toBe(mount);
		expect(app.unmount).toBe(unmount);
		expect(disconnect()).toBeUndefined();
	});
});
