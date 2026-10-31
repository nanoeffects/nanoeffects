import { describe, expect, it, vi } from "vitest";
import { contextPlugin } from "../context";
import type { Call } from "../core/action-creator";
import { createBus } from "../core/bus";
import { effectsPlugin } from "../effects";
import { matchPlugin } from "../match";
import type { TestEvents } from "../tests/test-helpers";
import { delay } from "../utils";
import { createAction } from "./action";
import { actionsPlugin, setHandler } from "./command";
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
			(app) => app.actions,
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
		app.actions;
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

	it("lets a handler bound through app.actions win over the modules", () => {
		const bus = createBus<TestEvents>();
		const command = createAction<Call<number, number>>("c");
		const app = bus.use(
			modulePlugin<TestEvents>([
				createModule("a", (moduleContext) => {
					moduleContext.handle(command, () => 1);
				}),
			]),
		);
		app.actions.handle(command, () => 2);

		// the modules are mounted before the handler is bound, so the later one wins
		expect(bus.emit(command, 0)).toBe(2);
	});

	it("merges a actionsPlugin used after it", () => {
		const bus = createBus<TestEvents>();
		const mine = createAction<Call<number, number>>("mine");
		const other = createAction<Call<number, number>>("other");
		const app = bus.use(
			modulePlugin<TestEvents>([
				createModule("a", (moduleContext) => {
					moduleContext.handle(mine, () => 1);
				}),
			]),
		);
		bus.use(actionsPlugin<TestEvents>([setHandler(other, () => 2)]));

		expect(bus.actions).toBe(app.actions);
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

describe("modulePlugin starts at the end of the synchronous block", () => {
	const tick = () => Promise.resolve();

	it("mounts the given modules when nothing uses the app", async () => {
		const bus = createBus<TestEvents>();
		const setup = vi.fn();
		bus.use(modulePlugin([createModule<TestEvents>("a", setup)]));

		expect(setup).not.toHaveBeenCalled();
		await tick();
		expect(setup).toHaveBeenCalledTimes(1);
	});

	it("starts once when something uses the app before the end of the block", async () => {
		const bus = createBus<TestEvents>();
		const setup = vi.fn();
		bus.use(modulePlugin([createModule<TestEvents>("a", setup)]));
		bus.emit("t", 1);

		expect(setup).toHaveBeenCalledTimes(1);
		await tick();
		expect(setup).toHaveBeenCalledTimes(1);
	});

	it("gives the modules the fields of a plugin used later in the same block, with no use", async () => {
		const bus = createBus<TestEvents>();
		const store = { name: "main" };
		const seen: unknown[] = [];
		bus.use(
			modulePlugin([
				createModule<TestEvents>("a", (moduleContext) => {
					seen.push(Reflect.get(moduleContext, "store"));
				}),
			]),
		);
		bus.use(contextPlugin({ store }));
		await tick();

		expect(seen).toEqual([store]);
	});

	it("schedules nothing for no module, so the bus keeps its wrapper until the first use", async () => {
		const bus = createBus<TestEvents>();
		const before = bus.emit;
		bus.use(modulePlugin<TestEvents>());
		await tick();

		expect(bus.emit).not.toBe(before);
		bus.emit("t", 1);
		expect(bus.emit).toBe(before);
	});

	it("leaves the modules unmounted when the app is disposed before the end of the block", async () => {
		const bus = createBus<TestEvents>();
		const setup = vi.fn();
		const app = bus.use(modulePlugin([createModule<TestEvents>("a", setup)]));
		app.dispose();
		await tick();

		expect(setup).not.toHaveBeenCalled();
		expect(() => app.mount(createModule<TestEvents>("b", () => {}))).toThrow();
	});

	it("starts under fake timers, which do not fake queueMicrotask", async () => {
		vi.useFakeTimers();
		try {
			const bus = createBus<TestEvents>();
			const setup = vi.fn();
			bus.use(modulePlugin([createModule<TestEvents>("a", setup)]));
			await tick();

			expect(setup).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("reports a setup that throws, rolls the list back, replays the held listeners and stays usable", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const bus = createBus<TestEvents>();
			const log: string[] = [];
			const app = bus.use(
				modulePlugin([
					createModule<TestEvents>("a", (moduleContext) => {
						log.push("mount a");
						moduleContext.signal.addEventListener("abort", () =>
							log.push("stop a"),
						);
					}),
					createModule<TestEvents>("broken", () => {
						throw new Error("setup failed");
					}),
				]),
			);
			const outside = vi.fn();
			bus.on("t", outside);
			await tick();

			expect(error).toHaveBeenCalledTimes(1);
			expect(log).toEqual(["mount a", "stop a"]);

			bus.emit("t", 1);
			expect(outside).toHaveBeenCalledTimes(1);

			const later = vi.fn();
			app.mount(createModule<TestEvents>("later", later));
			expect(later).toHaveBeenCalledTimes(1);
		} finally {
			error.mockRestore();
		}
	});

	it("still throws a setup error from the first use that starts the app", () => {
		const bus = createBus<TestEvents>();
		const outside = vi.fn();
		bus.use(
			modulePlugin([
				createModule<TestEvents>("broken", () => {
					throw new Error("setup failed");
				}),
			]),
		);
		bus.on("t", outside);

		expect(() => bus.emit("t", 1)).toThrow("setup failed");
		bus.emit("t", 2);
		expect(outside).toHaveBeenCalledTimes(1);
	});
});
