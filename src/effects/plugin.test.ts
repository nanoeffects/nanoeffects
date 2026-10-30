import { describe, expect, it, vi } from "vitest";
import { createAction } from "../actions/action";
import { createBus } from "../core/bus";
import { aliveCount, settleGarbage } from "../tests/test-helpers";
import { all, delay, effectsPlugin, race, take } from ".";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("effectsPlugin", () => {
	it("returns the same bus", () => {
		const bus = createBus<{ load: string }>();

		expect(bus.use(effectsPlugin({ race }))).toBe(bus);
	});

	it("destructured race and all give what the free forms give", async () => {
		const bus = createBus<{ load: number }>().use(effectsPlugin({ race, all }));
		const results: unknown[] = [];

		bus.on("load", async (id, ctx) => {
			const { race: bound, all: boundAll } = ctx;
			const never = () => new Promise<number>(() => {});
			results.push(
				await race(ctx, { a: () => id, b: never }),
				await bound({ a: () => id, b: never }),
				await all(ctx, { a: () => id, b: () => id * 2 }),
				await boundAll({ a: () => id, b: () => id * 2 }),
			);
		});
		bus.emit("load", 3);
		await flush();

		expect(results).toEqual([
			{ a: 3 },
			{ a: 3 },
			{ a: 3, b: 6 },
			{ a: 3, b: 6 },
		]);
	});

	it("take waits for an event of the bus", async () => {
		const bus = createBus<{ start: undefined; saved: number }>().use(
			effectsPlugin({ take }),
		);
		let saved = 0;

		bus.on("start", async (_, { take }) => {
			saved = await take("saved");
		});
		bus.emit("start");
		bus.emit("saved", 7);
		await flush();

		expect(saved).toBe(7);
	});

	it("take waits for an action creator", async () => {
		const savedAction = createAction<number, "saved">("saved");
		const bus = createBus<{ start: undefined; saved: number }>().use(
			effectsPlugin({ take }),
		);
		let saved = 0;

		bus.on("start", async (_, { take }) => {
			saved = await take(savedAction);
		});
		bus.emit("start");
		bus.emit(savedAction(9));
		await flush();

		expect(saved).toBe(9);
	});

	it("delay stops when the task is aborted", async () => {
		vi.useFakeTimers();
		const bus = createBus<{ wait: undefined }>().use(effectsPlugin({ delay }));
		const outcomes: string[] = [];

		bus.on("wait", async (_, { delay, abort }) => {
			const pending = delay(1000).then(
				() => outcomes.push("done"),
				() => outcomes.push("aborted"),
			);
			abort();
			await pending;
		});
		bus.emit("wait");
		await vi.advanceTimersByTimeAsync(0);
		vi.useRealTimers();

		expect(outcomes).toEqual(["aborted"]);
	});

	it("puts only the passed effects on the context", () => {
		const bus = createBus<{ load: string }>().use(effectsPlugin({ race }));
		let keys: string[] = [];

		bus.on("load", (_, ctx) => {
			keys = Object.keys(ctx);
		});
		bus.emit("load", "x");

		expect(keys).toContain("race");
		expect(keys).not.toContain("all");
	});

	it("keeps an object context and a function context", () => {
		const store = { name: "main" };
		const seen: unknown[] = [];
		const fromObject = createBus<{ load: string }>({ context: { store } }).use(
			effectsPlugin({ all }),
		);
		const fromFunction = createBus<{ load: string }>({
			context: ({ type }: { type: string }) => ({ label: type }),
		}).use(effectsPlugin({ all }));

		fromObject.on("load", (_, ctx) => {
			seen.push(Reflect.get(ctx, "store"), typeof ctx.all);
		});
		fromFunction.on("load", (_, ctx) => {
			seen.push(Reflect.get(ctx, "label"), typeof ctx.all);
		});
		fromObject.emit("load", "x");
		fromFunction.emit("load", "x");

		expect(seen).toEqual([store, "function", "load", "function"]);
	});

	it("child tasks get the effects bound to themselves", async () => {
		const bus = createBus<{ load: string }>().use(effectsPlugin({ all }));
		const seen: unknown[] = [];

		bus.on("load", async (_, ctx) => {
			await ctx.run(async (_payload, child) => {
				seen.push(child.all === ctx.all, typeof child.all);
				await child.all({ a: () => 1 });
			});
		});
		bus.emit("load", "x");
		await flush();

		expect(seen).toEqual([false, "function"]);
	});

	it("does not replace a field that the context already has", () => {
		const bus = createBus<{ load: string }>();
		const own = () => "own";
		const previous = bus.addContext;
		bus.addContext = (ctx) => {
			previous?.(ctx);
			Object.assign(ctx, { delay: own });
		};
		const withEffects = bus.use(effectsPlugin({ delay, race }));
		const seen: unknown[] = [];

		withEffects.on("load", (_, ctx) => {
			seen.push(Object.is(ctx.delay, own), typeof ctx.race);
		});
		withEffects.emit("load", "x");

		expect(seen).toEqual([true, "function"]);
	});

	it("two effectsPlugin calls add up", () => {
		const bus = createBus<{ load: string }>()
			.use(effectsPlugin({ race }))
			.use(effectsPlugin({ all }));
		const types: string[] = [];

		bus.on("load", (_, ctx) => {
			types.push(typeof ctx.race, typeof ctx.all);
		});
		bus.emit("load", "x");

		expect(types).toEqual(["function", "function"]);
	});

	it("a task context can be collected after the task ends", async () => {
		const bus = createBus<{ load: number }>().use(effectsPlugin({ all }));
		const refs: Array<WeakRef<object>> = [];

		bus.on("load", async (id, ctx) => {
			refs.push(new WeakRef(ctx));
			await ctx.all({ a: () => id });
		});
		for (let id = 0; id < 100; id++) {
			bus.emit("load", id);
		}
		await flush();
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});
});
