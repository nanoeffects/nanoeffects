import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { createApp, type TestEvents } from "../tests/test-helpers";
import { createCommand, createCommands } from "./command";
import { createModule, registerModules } from "./module";

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
		const context = { store: { name: "main" } };
		const bus = createBus<TestEvents>({
			commands: createCommands<TestEvents>(),
			context,
		});
		let seen: unknown = null;
		registerModules(bus, [
			createModule("m", (moduleContext) => {
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

	it("a module can bind commands only on a bus made with createCommands", () => {
		const bus = createBus<TestEvents>();
		const double = createCommand<number, number>("double");

		expect(() =>
			registerModules(bus, [
				createModule("math", (moduleContext) => {
					moduleContext.handle(double, (value: number) => value * 2);
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
