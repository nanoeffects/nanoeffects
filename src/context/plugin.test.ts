import { describe, expect, it } from "vitest";
import { modulePlugin } from "../actions";
import { createBus, type WithContext } from "../core/bus";
import { all, effectsPlugin, retry } from "../effects";
import { fromSignal } from "../signal";
import { createTracer } from "../trace";
import { createTraceRecorder } from "../trace/recorder";
import { contextPlugin } from "./plugin";

type Store = { readonly name: string };
type Logger = { readonly level: string };
type LoadEvents = { load: string; saved: number };

const store: Store = { name: "main" };
const logger: Logger = { level: "info" };

describe("contextPlugin", () => {
	it("puts the fields on the context of a handler", () => {
		const bus = createBus<LoadEvents>().use(contextPlugin({ store }));
		let seen: Store | null = null;
		bus.on("load", (_, ctx) => {
			seen = ctx.store;
		});
		bus.emit("load", "a");

		expect(seen).toBe(store);
	});

	it("returns the same bus", () => {
		const bus = createBus<LoadEvents>();

		expect(bus.use(contextPlugin({ store }))).toBe(bus);
	});

	it("gives the fields to child tasks, tasks of effects and module handlers", async () => {
		const bus = createBus<LoadEvents>().use(contextPlugin({ store }));
		const seen: Array<Store | null> = [];
		bus.on("load", async (_, ctx) => {
			await ctx.run((_payload, child) => {
				seen.push(child.store);
			}, "x");
			await retry(ctx, () => {
				seen.push(ctx.store);
			});
			await all(ctx, {
				one: ({ signal }) => {
					seen.push(signal.aborted ? null : ctx.store);
				},
			});
		});
		const app = bus.use(
			modulePlugin<LoadEvents & WithContext<{ store: Store }>>(),
		);
		app.mount(
			app.createModule("m", (moduleContext) => {
				seen.push(moduleContext.store);
			}),
		);
		bus.emit("load", "a");
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(seen).toEqual([store, store, store, store]);
	});

	it("a function gets the type and the payload of the task", () => {
		const bus = createBus<LoadEvents>().use(
			contextPlugin((task) => ({
				scope: `${task.type}:${String(task.payload)}`,
			})),
		);
		let scope = "";
		bus.on("load", (_, ctx) => {
			scope = ctx.scope;
		});
		bus.emit("load", "a");

		expect(scope).toBe("load:a");
	});

	it("a function makes the fields for each task", () => {
		let count = 0;
		const bus = createBus<LoadEvents>().use(
			contextPlugin(() => {
				count += 1;
				return { order: count };
			}),
		);
		const orders: number[] = [];
		bus.on("load", (_, ctx) => {
			orders.push(ctx.order);
		});
		bus.emit("load", "a");
		bus.emit("load", "b");

		expect(orders).toEqual([1, 2]);
	});

	it("works with no event map", () => {
		const bus = createBus().use(contextPlugin({ store }));
		let seen: Store | null = null;
		bus.on("anything", (_, ctx) => {
			seen = ctx.store;
		});
		bus.emit("anything", 1);

		expect(seen).toBe(store);
	});

	it("two uses merge their fields", () => {
		const bus = createBus<LoadEvents>()
			.use(contextPlugin({ store }))
			.use(contextPlugin({ logger }));
		let seen: unknown[] = [];
		bus.on("load", (_, ctx) => {
			seen = [ctx.store, ctx.logger];
		});
		bus.emit("load", "a");

		expect(seen).toEqual([store, logger]);
	});

	it("merges with the context option and with effectsPlugin", () => {
		type Events = LoadEvents & WithContext<{ store: Store }>;
		const bus = createBus<Events>({ context: { store } })
			.use(contextPlugin({ logger }))
			.use(effectsPlugin({ all }));
		let seen: unknown[] = [];
		bus.on("load", (_, ctx) => {
			seen = [ctx.store, ctx.logger, typeof ctx.all];
		});
		bus.emit("load", "a");

		expect(seen).toEqual([store, logger, "function"]);
	});

	it("keeps the fields of the library when the names are the same", () => {
		const bus = createBus<LoadEvents>().use(
			contextPlugin({ signal: "mine", type: "mine" }),
		);
		let signal: unknown = null;
		let type: unknown = null;
		bus.on("load", (_, ctx) => {
			signal = Reflect.get(ctx, "signal");
			type = Reflect.get(ctx, "type");
		});
		bus.emit("load", "a");

		expect(signal).toBeInstanceOf(AbortSignal);
		expect(type).toBe("load");
	});

	it("does not replace a field the context already has", () => {
		const first: Store = { name: "first" };
		const second: Store = { name: "second" };
		const bus = createBus<LoadEvents & WithContext<{ store: Store }>>({
			context: { store: first },
		});
		// @ts-expect-error `store` is a field of the bus already
		bus.use(contextPlugin({ store: second }));
		let seen: Store | null = null;
		bus.on("load", (_, ctx) => {
			seen = ctx.store;
		});
		bus.emit("load", "a");

		expect(seen).toBe(first);
	});

	it("is a plugin of the bus: it does not touch another bus", () => {
		const bus = createBus<LoadEvents>().use(contextPlugin({ store }));
		const other = createBus<LoadEvents>();
		let seen: unknown = "unset";
		other.on("load", (_, ctx) => {
			seen = Reflect.get(ctx, "store");
		});
		other.emit("load", "a");
		bus.emit("load", "a");

		expect(seen).toBeUndefined();
	});
});

describe("fromSignal fields", () => {
	type Client = { readonly signal: AbortSignal };

	const setup = () => {
		const made: AbortSignal[] = [];
		const make = (signal: AbortSignal): Client => {
			made.push(signal);
			return { signal };
		};
		const bus = createBus<LoadEvents>().use(
			contextPlugin({ store, http: fromSignal(make) }),
		);

		return { bus, made };
	};

	it("builds the field from the signal of the task that reads it", () => {
		const { bus, made } = setup();
		let seen: Client | null = null;
		let own: AbortSignal | null = null;
		bus.on("load", (_, ctx) => {
			seen = ctx.http;
			own = ctx.signal;
		});
		bus.emit("load", "a");

		expect(seen).toEqual({ signal: own });
		expect(made).toEqual([own]);
	});

	it("leaves the plain fields as they are", () => {
		const { bus } = setup();
		let seen: Store | null = null;
		bus.on("load", (_, ctx) => {
			seen = ctx.store;
		});
		bus.emit("load", "a");

		expect(seen).toBe(store);
	});

	it("does not build a field that nobody reads", () => {
		const { bus, made } = setup();
		bus.on("load", () => {});
		bus.emit("load", "a");

		expect(made).toHaveLength(0);
	});

	it("builds it once for a task", () => {
		const { bus, made } = setup();
		const seen: Client[] = [];
		bus.on("load", (_, ctx) => {
			seen.push(ctx.http, ctx.http, ctx.http);
		});
		bus.emit("load", "a");

		expect(made).toHaveLength(1);
		expect(new Set(seen).size).toBe(1);
	});

	it("gives a child task its own, from its own signal, and leaves the parent unbuilt", async () => {
		const { bus, made } = setup();
		const signals: AbortSignal[] = [];
		bus.on("load", async (_, ctx) => {
			await ctx.run((_payload, child) => {
				signals.push(child.signal, child.http.signal);
			}, "x");
			signals.push(ctx.signal);
		});
		bus.emit("load", "a");
		await Promise.resolve();
		await Promise.resolve();

		const [childSignal, clientSignal, parentSignal] = signals;
		expect(clientSignal).toBe(childSignal);
		expect(childSignal).not.toBe(parentSignal);
		expect(made).toEqual([childSignal]);
	});

	it("is not built by a copy, a listing or a trace", () => {
		const made: AbortSignal[] = [];
		const recorder = createTraceRecorder<LoadEvents>();
		const bus = createBus<LoadEvents>({ trace: createTracer(recorder) }).use(
			contextPlugin({
				http: fromSignal((signal) => {
					made.push(signal);
					return {};
				}),
			}),
		);
		let listed: string[] = [];
		let present = false;
		bus.on("load", (_, ctx) => {
			const copy = { ...ctx };
			listed = Object.keys(copy);
			present = "http" in ctx;
		});
		bus.emit("load", "a");

		expect(listed).not.toContain("http");
		expect(present).toBe(true);
		expect(made).toHaveLength(0);
	});

	it("makes the value with an aborted signal when the task is aborted already", () => {
		const { bus } = setup();
		let aborted: boolean | null = null;
		bus.on("load", (_, ctx) => {
			ctx.abort("stop");
			aborted = ctx.http.signal.aborted;
		});
		bus.emit("load", "a");

		expect(aborted).toBe(true);
	});

	it("reaches the request when the task aborts after the read", () => {
		const { bus } = setup();
		const reasons: unknown[] = [];
		bus.on("load", (_, ctx) => {
			ctx.http.signal.addEventListener("abort", () => {
				reasons.push(ctx.http.signal.reason);
			});
			ctx.abort("stop");
		});
		bus.emit("load", "a");

		expect(reasons).toEqual(["stop"]);
	});

	it("works as the result of a function of the task", () => {
		const made: string[] = [];
		const bus = createBus<LoadEvents>().use(
			contextPlugin(({ type }) => ({
				http: fromSignal(() => {
					made.push(type);
					return type;
				}),
			})),
		);
		let seen = "";
		bus.on("load", (_, ctx) => {
			seen = ctx.http;
		});
		bus.emit("load", "a");

		expect(seen).toBe("load");
		expect(made).toEqual(["load"]);
	});
});
