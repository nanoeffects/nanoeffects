import { describe, expect, it, vi } from "vitest";
import type { Call } from "../core/action-creator";
import { delay, take } from "../effects";
import { createApp } from "../tests/test-helpers";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { createAction } from "./action";
import { setHandler } from "./command";
import { createModule } from "./module";

type Events = { ping: number; pong: string; job: number };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createModule", () => {
	it("keeps the name and the setup", () => {
		const setup = vi.fn();
		const module = createModule("user", setup);

		expect(module.name).toBe("user");
		expect(module.setup).toBe(setup);
	});
});

describe("createApp", () => {
	it("mounts the modules it is given, in order", () => {
		const order: string[] = [];
		createApp<Events>({
			modules: [
				createModule("a", () => order.push("a")),
				createModule("b", () => order.push("b")),
			],
		});

		expect(order).toEqual(["a", "b"]);
	});

	it("gives setup the context of a task named after the module", () => {
		const seen: unknown[] = [];
		createApp<Events>({
			modules: [
				createModule("user", (moduleContext) => {
					seen.push(moduleContext.type, moduleContext.signal.aborted);
				}),
			],
		});

		expect(seen).toEqual(["user", false]);
	});

	it("has a bus that runs the commands bound by the modules", () => {
		const getUser = createAction<Call<string, string>>("user/get");
		const app = createApp<Events>({
			modules: [
				createModule("user", (moduleContext) =>
					moduleContext.handle(getUser, (id) => `user ${id}`),
				),
			],
		});

		expect(app.bus.emit(getUser, "1")).toBe("user 1");
	});

	it("passes the bus options on", async () => {
		const onError = vi.fn();
		const app = createApp<Events>({ onError });
		app.bus.on("ping", async () => {
			throw new Error("boom");
		});
		app.bus.emit("ping", 1);
		await flush();

		expect(onError).toHaveBeenCalledTimes(1);
	});

	it("works with no options", () => {
		expect(() => createApp()).not.toThrow();
	});
});

describe("module context", () => {
	describe("handle", () => {
		it("binds the handler of a command", () => {
			const command = createAction<Call<number, number>>("math/double");
			const app = createApp<Events>({
				modules: [
					createModule("math", (moduleContext) =>
						moduleContext.handle(command, (value) => value * 2),
					),
				],
			});

			expect(app.bus.emit(command, 4)).toBe(8);
		});

		it("binds a list of handlers", () => {
			const first = createAction<Call<number, number>>("a");
			const second = createAction<Call<number, number>>("b");
			const app = createApp<Events>({
				modules: [
					createModule("math", (moduleContext) =>
						moduleContext.handle([
							setHandler(first, (value) => value + 1),
							setHandler(second, (value) => value * 2),
						]),
					),
				],
			});

			expect([app.bus.emit(first, 1), app.bus.emit(second, 5)]).toEqual([
				2, 10,
			]);
		});

		it("accepts the type as a string", () => {
			const command = createAction<Call<number, number>>("a/b");
			const app = createApp<Events>({
				modules: [
					createModule("m", (moduleContext) =>
						moduleContext.handle("a/b", () => 7),
					),
				],
			});

			expect(app.bus.emit(command, 0)).toBe(7);
		});

		it("returns a function that unbinds at once", () => {
			const command = createAction<number, number>("a/b", (value) => value);
			const app = createApp<Events>();
			let unbind: () => void = () => {};
			app.mount(
				createModule("m", (moduleContext) => {
					unbind = moduleContext.handle(command, () => 99);
				}),
			);
			expect(app.bus.emit(command, 1)).toBe(99);
			unbind();

			expect(app.bus.emit(command, 1)).toBe(1);
		});

		it("is undone when the module is unmounted, and the command's own handler is back", () => {
			const command = createAction<number, number>("a/b", (value) => value);
			const app = createApp<Events>();
			const module = createModule<Events>("m", (moduleContext) =>
				moduleContext.handle(command, () => 99),
			);
			const unmount = app.mount(module);
			expect(app.bus.emit(command, 1)).toBe(99);
			unmount();

			expect(app.bus.emit(command, 1)).toBe(1);
		});

		it("the module mounted last wins, and unmounting it brings the other back", () => {
			const command = createAction<Call<number, string>>("a/b");
			const app = createApp<Events>();
			app.mount(
				createModule("first", (moduleContext) =>
					moduleContext.handle(command, () => "first"),
				),
			);
			const unmount = app.mount(
				createModule("second", (moduleContext) =>
					moduleContext.handle(command, () => "second"),
				),
			);
			expect(app.bus.emit(command, 1)).toBe("second");
			unmount();

			expect(app.bus.emit(command, 1)).toBe("first");
		});

		it("a bound handler gets the payload and a task context", () => {
			const seen: unknown[] = [];
			const command = createAction<Call<number, void>>("a/b");
			const app = createApp<Events>({
				modules: [
					createModule("m", (moduleContext) =>
						moduleContext.handle(command, (value, ctx) => {
							seen.push(value, ctx.type);
						}),
					),
				],
			});
			app.bus.emit(command, 3);

			expect(seen).toEqual([3, "a/b"]);
		});
	});

	describe("on and emit", () => {
		it("subscribes to events", () => {
			const handler = vi.fn();
			const app = createApp<Events>({
				modules: [
					createModule("m", (moduleContext) =>
						moduleContext.on("ping", handler),
					),
				],
			});
			app.bus.emit("ping", 5);

			expect(handler.mock.calls[0]?.[0]).toBe(5);
		});

		it("subscribes to an action creator", () => {
			const pinged = createAction<number, "ping">("ping");
			const handler = vi.fn();
			const app = createApp<Events>({
				modules: [
					createModule("m", (moduleContext) =>
						moduleContext.on(pinged, handler),
					),
				],
			});
			app.bus.emit(pinged(2));

			expect(handler.mock.calls[0]?.[0]).toBe(2);
		});

		it("a listener can emit through its context", () => {
			const pong = vi.fn();
			const app = createApp<Events>({
				modules: [
					createModule("m", (moduleContext) => {
						moduleContext.on("ping", (value, ctx) =>
							ctx.emit("pong", `got ${value}`),
						);
					}),
				],
			});
			app.bus.on("pong", pong);
			app.bus.emit("ping", 1);

			expect(pong.mock.calls[0]?.[0]).toBe("got 1");
		});

		it("the module can emit while it is set up", () => {
			const pong = vi.fn();
			const app = createApp<Events>();
			app.bus.on("pong", pong);
			app.mount(
				createModule("m", (moduleContext) =>
					moduleContext.emit("pong", "hello"),
				),
			);

			expect(pong.mock.calls[0]?.[0]).toBe("hello");
		});

		it("subscriptions end when the module is unmounted", () => {
			const handler = vi.fn();
			const app = createApp<Events>();
			const unmount = app.mount(
				createModule("m", (moduleContext) => moduleContext.on("ping", handler)),
			);
			app.bus.emit("ping", 1);
			unmount();
			app.bus.emit("ping", 2);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("an unmounted module no longer emits", () => {
			const pong = vi.fn();
			const app = createApp<Events>();
			app.bus.on("pong", pong);
			const emitters: Array<() => void> = [];
			const unmount = app.mount(
				createModule("m", (moduleContext) => {
					emitters.push(() => moduleContext.emit("pong", "late"));
				}),
			);
			unmount();
			emitters[0]?.();

			expect(pong).not.toHaveBeenCalled();
		});
	});

	describe("use", () => {
		it("mounts sub-modules", () => {
			const handler = vi.fn();
			const sub = createModule<Events>("sub", (moduleContext) =>
				moduleContext.on("ping", handler),
			);
			const app = createApp<Events>({
				modules: [
					createModule("parent", (moduleContext) => moduleContext.use(sub)),
				],
			});
			app.bus.emit("ping", 1);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("mounts several at once, in order", () => {
			const order: string[] = [];
			const first = createModule<Events>("a", () => order.push("a"));
			const second = createModule<Events>("b", () => order.push("b"));
			createApp<Events>({
				modules: [
					createModule("p", (moduleContext) =>
						moduleContext.use(first, second),
					),
				],
			});

			expect(order).toEqual(["a", "b"]);
		});

		it("unmounting the parent unmounts the sub-modules", () => {
			const handler = vi.fn();
			const sub = createModule<Events>("sub", (moduleContext) =>
				moduleContext.on("ping", handler),
			);
			const app = createApp<Events>();
			const unmount = app.mount(
				createModule("parent", (moduleContext) => moduleContext.use(sub)),
			);
			unmount();
			app.bus.emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("returns a function that unmounts just those sub-modules", () => {
			const firstHandler = vi.fn();
			const secondHandler = vi.fn();
			const first = createModule<Events>("a", (moduleContext) =>
				moduleContext.on("ping", firstHandler),
			);
			const second = createModule<Events>("b", (moduleContext) =>
				moduleContext.on("ping", secondHandler),
			);
			const app = createApp<Events>();
			app.mount(
				createModule("p", (moduleContext) => {
					const unuse = moduleContext.use(first);
					moduleContext.use(second);
					unuse();
				}),
			);
			app.bus.emit("ping", 1);

			expect(firstHandler).not.toHaveBeenCalled();
			expect(secondHandler).toHaveBeenCalledTimes(1);
		});

		it("a sub-module can be added later, from a listener", () => {
			const handler = vi.fn();
			const late = createModule<Events>("late", (moduleContext) =>
				moduleContext.on("pong", handler),
			);
			const app = createApp<Events>({
				modules: [
					createModule("p", (moduleContext) => {
						moduleContext.on("ping", () => {
							moduleContext.use(late);
						});
					}),
				],
			});
			app.bus.emit("pong", "before");
			app.bus.emit("ping", 1);
			app.bus.emit("pong", "after");

			expect(handler.mock.calls.map((call) => call[0])).toEqual(["after"]);
		});

		it("nests more than one level", () => {
			const handler = vi.fn();
			const leaf = createModule<Events>("leaf", (moduleContext) =>
				moduleContext.on("ping", handler),
			);
			const mid = createModule<Events>("mid", (moduleContext) =>
				moduleContext.use(leaf),
			);
			const app = createApp<Events>();
			const unmount = app.mount(
				createModule("top", (moduleContext) => moduleContext.use(mid)),
			);
			app.bus.emit("ping", 1);
			unmount();
			app.bus.emit("ping", 2);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("mounting the same sub-module twice from one parent runs it once", () => {
			const setup = vi.fn();
			const sub = createModule<Events>("sub", setup);
			createApp<Events>({
				modules: [
					createModule("p", (moduleContext) => moduleContext.use(sub, sub)),
				],
			});

			expect(setup).toHaveBeenCalledTimes(1);
		});
	});

	describe("spawn", () => {
		it("starts a background task with its payload", async () => {
			const seen: unknown[] = [];
			createApp<Events>({
				modules: [
					createModule("m", (moduleContext) => {
						moduleContext.spawn(async (value: number) => {
							seen.push(value);
						}, 5);
					}),
				],
			});
			await flush();

			expect(seen).toEqual([5]);
		});

		it("gets the context of the module, with its name as the type", async () => {
			const seen: unknown[] = [];
			createApp<Events>({
				modules: [
					createModule("worker", (moduleContext) => {
						moduleContext.spawn(async (_: undefined, ctx) => {
							seen.push(ctx.signal.aborted);
						});
					}),
				],
			});
			await flush();

			expect(seen).toEqual([false]);
		});

		it("is aborted when the module is unmounted", async () => {
			const signals: AbortSignal[] = [];
			const app = createApp<Events>();
			const unmount = app.mount(
				createModule("m", (moduleContext) => {
					moduleContext.spawn((_: undefined, ctx) => {
						signals.push(ctx.signal);
						return delay(ctx, 10_000);
					});
				}),
			);
			expect(signals[0]?.aborted).toBe(false);
			unmount();
			await flush();

			expect(signals[0]?.aborted).toBe(true);
		});

		it("an abort that ends the task is not reported as an error", async () => {
			const app = createApp<Events>();
			const unmount = app.mount(
				createModule("m", (moduleContext) => {
					moduleContext.spawn((_: undefined, ctx) => delay(ctx, 10_000));
				}),
			);
			unmount();

			await flush();
		});

		it("can run a watcher loop built on take", async () => {
			const seen: number[] = [];
			const app = createApp<Events>({
				modules: [
					createModule("watcher", (moduleContext) => {
						moduleContext.spawn(async (_: undefined, ctx) => {
							for (;;) {
								seen.push(await take(ctx, "job"));
							}
						});
					}),
				],
			});
			app.bus.emit("job", 1);
			await flush();
			app.bus.emit("job", 2);
			await flush();
			app.dispose();
			await flush();

			expect(seen).toEqual([1, 2]);
		});
	});
});

describe("modules on the fly", () => {
	it("mounts a module after the app was created", () => {
		const handler = vi.fn();
		const app = createApp<Events>();
		app.mount(
			createModule("late", (moduleContext) =>
				moduleContext.on("ping", handler),
			),
		);
		app.bus.emit("ping", 1);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("unmounts with the returned function", () => {
		const handler = vi.fn();
		const app = createApp<Events>();
		const unmount = app.mount(
			createModule("m", (moduleContext) => moduleContext.on("ping", handler)),
		);
		unmount();
		app.bus.emit("ping", 1);

		expect(handler).not.toHaveBeenCalled();
	});

	it("unmounts by reference", () => {
		const handler = vi.fn();
		const module = createModule<Events>("m", (moduleContext) =>
			moduleContext.on("ping", handler),
		);
		const app = createApp<Events>({ modules: [module] });
		app.unmount(module);
		app.bus.emit("ping", 1);

		expect(handler).not.toHaveBeenCalled();
	});

	it("unmounting a module that is not mounted does nothing", () => {
		const app = createApp<Events>();

		expect(() => app.unmount(createModule("x", () => {}))).not.toThrow();
	});

	it("unmounting twice is harmless", () => {
		const app = createApp<Events>();
		const unmount = app.mount(createModule("m", () => {}));

		expect(() => {
			unmount();
			unmount();
		}).not.toThrow();
	});

	it("mounting a mounted module again runs it once and returns the same unmount", () => {
		const setup = vi.fn();
		const module = createModule<Events>("m", setup);
		const app = createApp<Events>();
		const first = app.mount(module);
		const second = app.mount(module);

		expect(setup).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
	});

	it("tells whether a module is mounted", () => {
		const module = createModule<Events>("m", () => {});
		const app = createApp<Events>();
		expect(app.isMounted(module)).toBe(false);
		app.mount(module);
		expect(app.isMounted(module)).toBe(true);
		app.unmount(module);

		expect(app.isMounted(module)).toBe(false);
	});

	it("a module can be mounted again after it was unmounted, and its setup runs afresh", () => {
		const handler = vi.fn();
		const setup = vi.fn(
			(moduleContext: { on: (error: "ping", f: () => void) => void }) => {
				moduleContext.on("ping", handler);
			},
		);
		const module = createModule<Events>("m", setup);
		const app = createApp<Events>();
		app.mount(module);
		app.unmount(module);
		app.mount(module);
		app.bus.emit("ping", 1);

		expect(setup).toHaveBeenCalledTimes(2);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("unmounting during events does not disturb the other modules", () => {
		const first = vi.fn();
		const second = vi.fn();
		const modA = createModule<Events>("a", (moduleContext) =>
			moduleContext.on("ping", first),
		);
		const modB = createModule<Events>("b", (moduleContext) =>
			moduleContext.on("ping", second),
		);
		const app = createApp<Events>({ modules: [modA, modB] });
		app.bus.emit("ping", 1);
		app.unmount(modA);
		app.bus.emit("ping", 2);

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(2);
	});

	it("the same module in two apps is independent", () => {
		const handler = vi.fn();
		const module = createModule<Events>("m", (moduleContext) =>
			moduleContext.on("ping", handler),
		);
		const one = createApp<Events>({ modules: [module] });
		const two = createApp<Events>({ modules: [module] });
		one.unmount(module);
		one.bus.emit("ping", 1);
		two.bus.emit("ping", 1);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("a module whose setup throws is undone, and the error is thrown from mount", () => {
		const handler = vi.fn();
		const command = createAction<number, number>("a/b", (value) => value);
		const app = createApp<Events>();
		const broken = createModule<Events>("broken", (moduleContext) => {
			moduleContext.on("ping", handler);
			moduleContext.handle(command, () => 99);
			throw new Error("bad setup");
		});

		expect(() => app.mount(broken)).toThrow("bad setup");
		app.bus.emit("ping", 1);
		expect(handler).not.toHaveBeenCalled();
		expect(app.bus.emit(command, 1)).toBe(1);
		expect(app.isMounted(broken)).toBe(false);
	});

	it("commands are bound and unbound on the fly through the registry", () => {
		const command = createAction<Call<number, number>>("a/b");
		const app = createApp<Events>();
		expect(() => app.bus.emit(command(1))).not.toThrow();
		const unbind = app.actions.handle(command, (value) => value + 1);
		expect(app.bus.emit(command, 1)).toBe(2);
		unbind();

		expect(() => app.bus.emit(command(1))).not.toThrow();
	});

	describe("dispose", () => {
		it("unmounts everything", () => {
			const handler = vi.fn();
			const app = createApp<Events>({
				modules: [
					createModule("m", (moduleContext) =>
						moduleContext.on("ping", handler),
					),
				],
			});
			app.dispose();
			app.bus.emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("aborts the background tasks", async () => {
			const signals: AbortSignal[] = [];
			const app = createApp<Events>({
				modules: [
					createModule("m", (moduleContext) => {
						moduleContext.spawn((_: undefined, ctx) => {
							signals.push(ctx.signal);
							return delay(ctx, 10_000);
						});
					}),
				],
			});
			app.dispose();
			await flush();

			expect(signals[0]?.aborted).toBe(true);
		});

		it("a disposed app does not mount modules", () => {
			const app = createApp<Events>();
			app.dispose();

			expect(() => app.mount(createModule("m", () => {}))).toThrow();
		});

		it("disposing twice is harmless", () => {
			const app = createApp<Events>();

			expect(() => {
				app.dispose();
				app.dispose();
			}).not.toThrow();
		});
	});
});

describe("modules in the trace", () => {
	it("a spawned task is traced under the name of its module", async () => {
		const recorder = createTraceRecorder<Events>();
		createApp<Events>({
			trace: createTracer(recorder),
			modules: [
				createModule("worker", (moduleContext) => {
					moduleContext.spawn(async () => {});
				}),
			],
		});
		await flush();
		const run = recorder.events.find((event) => event.effect === "run");

		expect(run?.type).toBe("worker");
		expect(recorder.events.map((event) => event.phase)).toEqual([
			"start",
			"done",
		]);
	});

	it("a command run by the bus is traced with the command type", () => {
		const recorder = createTraceRecorder<Events>();
		const command = createAction<Call<number, number>>("math/double");
		const app = createApp<Events>({
			trace: createTracer(recorder),
			modules: [
				createModule("math", (moduleContext) =>
					moduleContext.handle(command, (value) => value * 2),
				),
			],
		});
		app.bus.emit(command, 2);

		expect(
			recorder.events.map(
				(event) => `${event.type}/${event.effect}/${event.phase}`,
			),
		).toEqual(["math/double/command/start", "math/double/command/done"]);
	});
});

describe("app.mount and app.unmount with several modules", () => {
	const named = (name: string, log: string[]) =>
		createModule<Events>(name, (moduleContext) => {
			log.push(`mount ${name}`);
			moduleContext.signal.addEventListener("abort", () =>
				log.push(`stop ${name}`),
			);
		});

	it("mounts one module as before", () => {
		const log: string[] = [];
		const app = createApp<Events>();
		const first = named("first", log);
		const stop = app.mount(first);

		expect(app.isMounted(first)).toBe(true);
		stop();
		expect(app.isMounted(first)).toBe(false);
	});

	it("mounts several modules in order and returns one function that undoes them, last first", () => {
		const log: string[] = [];
		const app = createApp<Events>();
		const stop = app.mount(named("a", log), named("b", log), named("c", log));

		expect(log).toEqual(["mount a", "mount b", "mount c"]);
		log.length = 0;
		stop();
		expect(log).toEqual(["stop c", "stop b", "stop a"]);
	});

	it("leaves a module that was mounted before, also when the function is called", () => {
		const log: string[] = [];
		const app = createApp<Events>();
		const a = named("a", log);
		const b = named("b", log);
		const c = named("c", log);
		app.mount(b);
		log.length = 0;

		const stop = app.mount(a, b, c);
		expect(log).toEqual(["mount a", "mount c"]);

		stop();
		expect(app.isMounted(b)).toBe(true);
		expect(app.isMounted(a)).toBe(false);
		expect(app.isMounted(c)).toBe(false);
	});

	it("unmounts several modules in reverse order of the arguments", () => {
		const log: string[] = [];
		const app = createApp<Events>();
		const a = named("a", log);
		const b = named("b", log);
		app.mount(a, b);
		log.length = 0;

		app.unmount(a, b);
		expect(log).toEqual(["stop b", "stop a"]);
	});

	it("undoes the modules of the call when the setup of one throws, and throws the error", () => {
		const log: string[] = [];
		const app = createApp<Events>();
		const broken = createModule<Events>("broken", () => {
			throw new Error("setup failed");
		});
		const c = named("c", log);

		expect(() => app.mount(named("a", log), broken, c)).toThrow("setup failed");
		expect(log).toEqual(["mount a", "stop a"]);
		expect(app.isMounted(c)).toBe(false);
	});

	it("does nothing with no module", () => {
		const app = createApp<Events>();
		const stop = app.mount();

		expect(stop).toBeTypeOf("function");
		expect(() => stop()).not.toThrow();
	});

	it("refuses to mount after dispose, several modules as one", () => {
		const log: string[] = [];
		const app = createApp<Events>();
		app.dispose();

		expect(() => app.mount(named("a", log), named("b", log))).toThrow();
		expect(log).toEqual([]);
	});

	it("replaces a module of the same name, as a single mount does", () => {
		const log: string[] = [];
		const app = createApp<Events>();
		app.mount(named("user", log));
		log.length = 0;

		app.mount(named("user", log), named("other", log));
		expect(log).toEqual(["stop user", "mount user", "mount other"]);
	});

	it("takes a list that is spread", () => {
		const log: string[] = [];
		const app = createApp<Events>();
		const modules = [named("a", log), named("b", log)];
		const stop = app.mount(...modules);

		expect(modules.every((module) => app.isMounted(module))).toBe(true);
		stop();
		expect(modules.some((module) => app.isMounted(module))).toBe(false);
	});
});
