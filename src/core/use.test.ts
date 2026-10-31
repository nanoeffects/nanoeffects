import { describe, expect, it } from "vitest";
import type { TestEvents } from "../tests/test-helpers";
import { createBus } from "./bus";

describe("bus.use", () => {
	it("calls the plugin with the bus and returns what it returns", () => {
		const bus = createBus<TestEvents>();
		const result = bus.use((given) => ({ same: given === bus }));

		expect(result).toEqual({ same: true });
	});

	it("calls the plugin once, at once", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		bus.use(() => calls.push("plugin"));
		calls.push("after");

		expect(calls).toEqual(["plugin", "after"]);
	});

	it("a plugin can use the bus and return the function that undoes it", () => {
		const bus = createBus<TestEvents>();
		const seen: number[] = [];
		const off = bus.use((given) =>
			given.on("t", (value) => {
				seen.push(value);
			}),
		);
		bus.emit("t", 1);
		off();
		bus.emit("t", 2);

		expect(seen).toEqual([1]);
	});

	it("an error of a plugin comes out of use", () => {
		const bus = createBus<TestEvents>();
		const boom = new Error("boom");

		expect(() =>
			bus.use(() => {
				throw boom;
			}),
		).toThrow(boom);
	});

	it("plugins run in the order they are used", () => {
		const bus = createBus<TestEvents>();
		const order: string[] = [];
		bus.use(() => order.push("a"));
		bus.use(() => order.push("b"));

		expect(order).toEqual(["a", "b"]);
	});

	it("a plugin sees the context, the trace and the commands of the bus", () => {
		const context = { label: "x" };
		const bus = createBus<TestEvents>({ context: context as never });
		const seen = bus.use((given) => ({
			ctx: given.ctx,
			actions: given.actions,
		}));

		expect(seen.ctx).toBe(context);
		expect(seen.actions).toBeUndefined();
	});
});
