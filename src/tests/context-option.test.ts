import { describe, expect, it, vi } from "vitest";
import { createCommand, createCommands, createModule } from "../actions";
import { type Context, createBus } from "../core/bus";
import { all, retry } from "../effects";
import { debounce, queue } from "../policies";
import { createApp, type TestEvents } from "./test-helpers";

type Store = { readonly name: string };

declare global {
	interface NanoeffectsContext {
		store: Store;
	}
}

const store: Store = { name: "main" };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("BusOptions.context", () => {
	it("adds its fields to the context of a handler", () => {
		const bus = createBus<TestEvents>({ context: { store } });
		let seen: Store | null = null;
		bus.on("t", (_, ctx) => {
			seen = ctx.store;
		});
		bus.emit("t", 1);

		expect(seen).toBe(store);
	});

	it("keeps the fields of the library when the names are the same", () => {
		const bus = createBus<TestEvents>({
			context: { store, signal: "mine", type: "mine" } as never,
		});
		let ctx: Context<TestEvents> | null = null;
		bus.on("t", (_, ctx2) => {
			ctx = ctx2;
		});
		bus.emit("t", 1);

		expect(ctx).toMatchObject({ type: "t" });
		expect((ctx as unknown as Context<TestEvents>).signal).toBeInstanceOf(
			AbortSignal,
		);
	});

	it("is in the context of a child task, ctx.run, and of listeners added by ctx.on", async () => {
		const bus = createBus<TestEvents>({ context: { store } });
		const seen: Array<Store> = [];
		bus.on("t", async (_, ctx) => {
			ctx.on("b", (__, inner) => {
				seen.push(inner.store);
			});
			await ctx.run((_p: undefined, child) => {
				seen.push(child.store);
			});
			ctx.emit("b", "x");
		});
		bus.emit("t", 1);
		await flush();

		expect(seen).toEqual([store, store]);
	});

	it("is in the contexts of effects and policies that make child tasks", async () => {
		const bus = createBus<TestEvents>({ context: { store } });
		const seen: Array<Store> = [];
		bus.on(
			"t",
			queue<number, TestEvents, void>((_, ctx) => {
				seen.push(ctx.store);
			}),
		);
		bus.on(
			"b",
			debounce<string, TestEvents, void>(0, (_, ctx) => {
				seen.push(ctx.store);
			}),
		);
		bus.on("t", async (_, ctx) => {
			await retry(ctx, () => {
				seen.push(ctx.store);
			});
			await all(ctx, [
				({ signal }) => {
					seen.push(ctx.store);
					return signal.aborted;
				},
			]);
		});
		bus.emit("t", 1);
		bus.emit("b", "x");
		await flush();

		expect(seen.length).toBeGreaterThanOrEqual(4);
		expect(seen.every((item) => item === store)).toBe(true);
	});

	it("is in the context of a command handler", async () => {
		const read = createCommand(
			"read",
			(_: undefined, ctx: Context<TestEvents>) => {
				return ctx.store.name;
			},
		);
		const bus = createBus<TestEvents>({
			context: { store },
			commands: createCommands(),
		});

		expect(bus.emit(read)).toBe("main");
	});

	it("is in the contexts of modules and of what they spawn", async () => {
		const seen: Array<string> = [];
		const app = createApp<TestEvents>({ context: { store } });
		app.mount(
			createModule<TestEvents>("m", (moduleContext) => {
				seen.push(moduleContext.store.name);
				moduleContext.on("t", (_, ctx) => {
					seen.push(ctx.store.name);
				});
				moduleContext.spawn(async (_p: undefined, ctx) => {
					seen.push(ctx.store.name);
				});
			}),
		);
		app.bus.emit("t", 1);
		await flush();

		expect(seen).toEqual(["main", "main", "main"]);
		app.dispose();
	});

	it("does nothing when it is not set", () => {
		const bus = createBus<TestEvents>();
		const handler = vi.fn();
		bus.on("t", (_, ctx) => handler(Object.hasOwn(ctx, "store")));
		bus.emit("t", 1);

		expect(handler).toHaveBeenCalledWith(false);
	});
});
