import { describe, expect, it, vi } from "vitest";
import { createBus, type WithContext } from "../core/bus";
import { createApp, type TestEvents } from "../tests/test-helpers";
import { createCommand, createCommands } from "./command";
import { createModule, type ModuleContext, registerModules } from "./module";

describe("registerModules", () => {
	it("mounts the given modules and mounts more later", () => {
		const setup = vi.fn();
		const commands = createCommands<TestEvents>();
		const bus = createBus<TestEvents>({ commands });
		const app = registerModules(bus, [createModule("first", setup)]);
		const later = createModule<TestEvents>("second", setup);
		const unmount = app.mount(later);

		expect(setup).toHaveBeenCalledTimes(2);
		expect(app.isMounted(later)).toBe(true);
		unmount();
		expect(app.isMounted(later)).toBe(false);
	});

	it("gives the modules the context of the bus", () => {
		type StoreEvents = TestEvents & WithContext<{ store: { name: string } }>;
		const context = { store: { name: "main" } };
		const bus = createBus<StoreEvents>({
			commands: createCommands<StoreEvents>(),
			context,
		});
		let seen: unknown = null;
		registerModules(bus, [
			createModule<StoreEvents>("m", (moduleContext) => {
				seen = moduleContext.store;
			}),
		]);

		expect(seen).toBe(context.store);
	});

	it("runs the commands that the modules bind on the bus", () => {
		const double = createCommand<number, number>("double");
		const { bus } = createApp<TestEvents>({
			modules: [
				createModule("math", (moduleContext) => {
					moduleContext.handle(double, (value: number) => value * 2);
				}),
			],
		});

		expect(bus.emit(double, 4)).toBe(8);
	});

	it("dispose unmounts the modules, and a disposed app cannot mount", () => {
		const aborted = vi.fn();
		const { mount, dispose } = createApp<TestEvents>();
		mount(
			createModule("m", (moduleContext) =>
				moduleContext.signal.addEventListener("abort", aborted),
			),
		);
		dispose();

		expect(aborted).toHaveBeenCalledTimes(1);
		expect(() => mount(createModule("late", () => {}))).toThrow();
	});

	it("brings its own registry when the bus has none, and the bus runs its commands", () => {
		const bus = createBus<TestEvents>();
		const double = createCommand<number, number>("double");
		const app = registerModules(bus, [
			createModule("math", (moduleContext) => {
				moduleContext.handle(double, (value: number) => value * 2);
			}),
		]);

		expect(bus.emit(double, 4)).toBe(8);
		expect(bus.commands).toBe(app.commands);
	});

	it("uses the registry that the bus was made with", () => {
		const commands = createCommands<TestEvents>();
		const bus = createBus<TestEvents>({ commands });
		const app = registerModules(bus);

		expect(app.commands).toBe(commands);
	});

	it("a custom commands runner without handle fails when a module binds", () => {
		const bus = createBus<TestEvents>({ commands: { run: () => 0 } });

		expect(() =>
			registerModules(bus, [
				createModule("math", (moduleContext) => {
					moduleContext.handle(createCommand("x"), () => {});
				}),
			]),
		).toThrow("createCommands");
	});

	it("modules that bind nothing work on a plain bus", () => {
		const bus = createBus<TestEvents>();
		const seen: number[] = [];
		registerModules(bus, [
			createModule("listener", (moduleContext) => {
				moduleContext.on("t", (value) => {
					seen.push(value);
				});
			}),
		]);
		bus.emit("t", 3);

		expect(seen).toEqual([3]);
	});
});

describe("replacing a module by its name (hot reload)", () => {
	const watch = () => {
		const bus = createBus<TestEvents>();
		const app = registerModules(bus);
		const calls: string[] = [];
		const version = (label: string) =>
			createModule<TestEvents>("user", (moduleContext) => {
				moduleContext.on("t", () => {
					calls.push(label);
				});
			});

		return { bus, app, calls, version };
	};

	it("a new module with the same name replaces the old one: its handlers are gone", () => {
		const { bus, app, calls, version } = watch();
		app.mount(version("old"));
		app.mount(version("new"));
		bus.emit("t", 1);

		expect(calls).toEqual(["new"]);
	});

	it("the old module is aborted, with its tasks", () => {
		const { app } = watch();
		const aborted = vi.fn();
		app.mount(
			createModule("user", (moduleContext) => {
				moduleContext.signal.addEventListener("abort", aborted);
			}),
		);
		app.mount(createModule("user", () => {}));

		expect(aborted).toHaveBeenCalledTimes(1);
	});

	it("the old commands are unbound, and the new ones answer", () => {
		const bus = createBus<TestEvents>();
		const app = registerModules(bus);
		const double = createCommand<number, number>("double");
		const moduleWith = (factor: number) =>
			createModule<TestEvents>("math", (moduleContext) => {
				moduleContext.handle(double, (value: number) => value * factor);
			});
		app.mount(moduleWith(2));
		app.mount(moduleWith(3));

		expect(bus.emit(double, 5)).toBe(15);
	});

	it("the unmount function of the replaced module does no harm later", () => {
		const { bus, app, calls, version } = watch();
		const unmountOld = app.mount(version("old"));
		app.mount(version("new"));
		unmountOld();
		bus.emit("t", 1);

		expect(calls).toEqual(["new"]);
	});

	it("mounting the same module object again changes nothing", () => {
		const { bus, app, calls, version } = watch();
		const module = version("only");
		app.mount(module);
		app.mount(module);
		bus.emit("t", 1);

		expect(calls).toEqual(["only"]);
	});

	it("sub-modules are replaced by name inside their parent", () => {
		const bus = createBus<TestEvents>();
		const app = registerModules(bus);
		const calls: string[] = [];
		const child = (label: string) =>
			createModule<TestEvents>("child", (moduleContext) => {
				moduleContext.on("t", () => {
					calls.push(label);
				});
			});
		const held: { parent?: ModuleContext<TestEvents> } = {};
		app.mount(
			createModule<TestEvents>("parent", (moduleContext) => {
				held.parent = moduleContext;
				moduleContext.use(child("old"));
			}),
		);
		held.parent?.use(child("new"));
		bus.emit("t", 1);

		expect(calls).toEqual(["new"]);
	});

	it("a hot reload as Vite calls it: dispose of the old file, then the new file mounts", () => {
		const { bus, app, calls, version } = watch();
		const disposers: Array<() => void> = [];
		const hot = { dispose: (callback: () => void) => disposers.push(callback) };
		const load = (label: string) => hot.dispose(app.mount(version(label)));
		load("v1");
		for (const dispose of disposers.splice(0)) {
			dispose();
		}
		load("v2");
		bus.emit("t", 1);

		expect(calls).toEqual(["v2"]);
	});
});
