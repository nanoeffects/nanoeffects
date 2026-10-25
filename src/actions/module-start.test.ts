import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { contextPlugin } from "../core/context-plugin";
import { effectsPlugin } from "../effects";
import { matchPlugin } from "../match";
import type { TestEvents } from "../tests/test-helpers";
import { delay } from "../utils";
import { commandsPlugin, createCommand } from "./command";
import { createModule, type ModuleApi, modulePlugin } from "./module";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("modulePlugin starts on the first use", () => {
	it("waits for the first emit", () => {
		const bus = createBus<TestEvents>();
		const setup = vi.fn();
		bus.use(modulePlugin([createModule<TestEvents>("a", setup)]));

		expect(setup).not.toHaveBeenCalled();
		bus.emit("t", 1);
		expect(setup).toHaveBeenCalledTimes(1);
		bus.emit("t", 2);
		expect(setup).toHaveBeenCalledTimes(1);
	});

	it("is started by each call of the app and by the read of commands", () => {
		const calls: Array<(app: ModuleApi<TestEvents>) => unknown> = [
			(app) => app.commands,
			(app) => app.isMounted(createModule<TestEvents>("x", () => {})),
			(app) => app.unmount(createModule<TestEvents>("x", () => {})),
			(app) => app.mount(createModule<TestEvents>("x", () => {})),
		];
		for (const call of calls) {
			const bus = createBus<TestEvents>();
			const setup = vi.fn();
			const app = bus.use(modulePlugin([createModule<TestEvents>("a", setup)]));
			call(app);

			expect(setup).toHaveBeenCalledTimes(1);
		}
	});

	it("gives the modules the fields of the plugins that come after it", async () => {
		const bus = createBus<TestEvents>();
		const store = { name: "main" };
		const seen: unknown[] = [];
		const app = bus.use(
			modulePlugin([
				createModule<TestEvents>("a", (moduleContext) => {
					seen.push(Reflect.get(moduleContext, "store"));
					seen.push(typeof Reflect.get(moduleContext, "delay"));
					moduleContext.spawn(async (_, ctx) => {
						seen.push(Reflect.get(ctx, "store"));
						seen.push(typeof Reflect.get(ctx, "delay"));
					});
				}),
			]),
		);
		bus.use(contextPlugin({ store }));
		bus.use(effectsPlugin({ delay }));
		bus.use(matchPlugin());
		app.commands;
		await flush();

		expect(seen).toEqual([store, "function", store, "function"]);
	});

	it("mounts a module given to mount after the given ones", () => {
		const bus = createBus<TestEvents>();
		const order: string[] = [];
		const named = (name: string) =>
			createModule<TestEvents>(name, () => {
				order.push(name);
			});
		const app = bus.use(modulePlugin([named("first")]));
		app.mount(named("second"));

		expect(order).toEqual(["first", "second"]);
	});

	it("does not start twice when a setup uses the app or emits", () => {
		const bus = createBus<TestEvents>();
		const setup = vi.fn();
		const app = bus.use(
			modulePlugin([
				createModule<TestEvents>("a", (moduleContext) => {
					setup();
					app.isMounted(createModule<TestEvents>("x", () => {}));
					moduleContext.emit("t", 1);
				}),
			]),
		);
		bus.emit("t", 1);

		expect(setup).toHaveBeenCalledTimes(1);
	});

	it("lets the bus emit as it did once it has started", () => {
		const bus = createBus<TestEvents>();
		const before = bus.emit;
		bus.use(modulePlugin<TestEvents>());

		expect(bus.emit).not.toBe(before);
		bus.emit("t", 1);
		expect(bus.emit).toBe(before);
	});

	it("puts the app on the bus", () => {
		const bus = createBus<TestEvents>();

		expect(Reflect.get(bus, "app")).toBeUndefined();
		const app = bus.use(modulePlugin<TestEvents>());
		expect(Reflect.get(bus, "app")).toBe(app);
	});

	it("lets a handler bound through app.commands win over the modules", () => {
		const bus = createBus<TestEvents>();
		const command = createCommand<number, number>("c");
		const app = bus.use(
			modulePlugin<TestEvents>([
				createModule("a", (moduleContext) => {
					moduleContext.handle(command, () => 1);
				}),
			]),
		);
		app.commands.handle(command, () => 2);

		// the modules are mounted before the handler is bound, so the later one wins
		expect(bus.emit(command, 0)).toBe(2);
	});

	it("merges a commandsPlugin used after it", () => {
		const bus = createBus<TestEvents>();
		const mine = createCommand<number, number>("mine");
		const other = createCommand<number, number>("other");
		const app = bus.use(
			modulePlugin<TestEvents>([
				createModule("a", (moduleContext) => {
					moduleContext.handle(mine, () => 1);
				}),
			]),
		);
		bus.use(commandsPlugin<TestEvents>([[other, () => 2]]));

		expect(bus.commands).toBe(app.commands);
		expect([bus.emit(mine, 0), bus.emit(other, 0)]).toEqual([1, 2]);
	});
});

describe("modulePlugin keeps the order of the listeners", () => {
	const listening = (calls: string[], name: string) =>
		createModule<TestEvents>(name, (moduleContext) => {
			moduleContext.on("t", () => {
				calls.push(name);
			});
		});

	it("puts the modules ahead of the listeners made after it, and after the ones made before", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		bus.on("t", () => calls.push("before"));
		bus.use(modulePlugin([listening(calls, "module")]));
		bus.on("t", () => calls.push("after"));
		bus.emit("t", 1);

		expect(calls).toEqual(["before", "module", "after"]);
	});

	it("replays the held calls in the order they were made", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		bus.use(modulePlugin<TestEvents>());
		bus.on("t", () => calls.push("first"));
		bus.once("t", () => calls.push("second"));
		bus.on("t", () => calls.push("third"));
		bus.emit("t", 1);
		bus.emit("t", 2);

		expect(calls).toEqual(["first", "second", "third", "first", "third"]);
	});

	it("removes a held subscription by its unsubscribe function, before and after the start", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		bus.use(modulePlugin<TestEvents>());
		const early = bus.on("t", () => calls.push("early"));
		const late = bus.on("t", () => calls.push("late"));
		early();
		bus.emit("t", 1);
		late();
		bus.emit("t", 2);

		expect(calls).toEqual(["late"]);
	});

	it("removes a held subscription with off, also one that was there before the plugin", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		const before = () => calls.push("before");
		const held = () => calls.push("held");
		bus.on("t", before);
		bus.use(modulePlugin<TestEvents>());
		bus.on("t", held);
		bus.off("t", held);
		bus.off("t", before);
		bus.emit("t", 1);

		expect(calls).toEqual([]);
	});

	it("keeps a listener a module adds from its setup ahead of the held ones", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		bus.use(
			modulePlugin<TestEvents>([
				createModule("a", () => {
					bus.on("t", () => calls.push("from setup"));
				}),
			]),
		);
		bus.on("t", () => calls.push("held"));
		bus.emit("t", 1);

		expect(calls).toEqual(["from setup", "held"]);
	});

	it("holds a predicate of matchPlugin, whichever plugin came first", () => {
		const orders = [
			(bus: ReturnType<typeof createBus<TestEvents>>) => {
				bus.use(matchPlugin());
				bus.use(modulePlugin<TestEvents>());
			},
			(bus: ReturnType<typeof createBus<TestEvents>>) => {
				bus.use(modulePlugin<TestEvents>());
				bus.use(matchPlugin());
			},
		];
		for (const order of orders) {
			const bus = createBus<TestEvents>();
			const calls: string[] = [];
			order(bus);
			Reflect.apply(bus.on, bus, [
				() => true,
				() => {
					calls.push("predicate");
				},
			]);
			bus.on("t", () => calls.push("named"));
			bus.emit("t", 1);

			expect(calls).toEqual(["named", "predicate"]);
		}
	});
});
