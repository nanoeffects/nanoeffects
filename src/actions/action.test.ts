import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { latest } from "../policies";
import { createAction } from "./action";
import { carriedBy } from "./carry";
import { actionsPlugin } from "./command";

type Events = {
	"counter/added": number;
	"counter/reset": undefined;
	"user/renamed": { id: string; name: string };
};

describe("createAction", () => {
	it("makes an action with the type and the payload", () => {
		const added = createAction<number>("counter/added");

		expect(added(2)).toEqual({ type: "counter/added", payload: 2 });
	});

	it("has the type", () => {
		expect(createAction("counter/added").type).toBe("counter/added");
	});

	it("turns into its type as a string", () => {
		const added = createAction("counter/added");

		expect(String(added)).toBe("counter/added");
		expect(`${added}`).toBe("counter/added");
	});

	it("makes an action without a payload", () => {
		const reset = createAction("counter/reset");

		expect(reset()).toEqual({ type: "counter/reset", payload: void 0 });
	});

	it("makes a new action each time", () => {
		const added = createAction<number>("counter/added");

		expect(added(1)).not.toBe(added(1));
		expect(added(1)).toEqual(added(1));
	});

	describe("match", () => {
		it("is true for actions of its type", () => {
			const added = createAction<number>("counter/added");

			expect(added.match(added(1))).toBe(true);
			expect(added.match({ type: "counter/added", payload: 5 })).toBe(true);
		});

		it("is false for other types", () => {
			const added = createAction<number>("counter/added");
			const other = createAction<number>("counter/removed");

			expect(added.match(other(1))).toBe(false);
			expect(added.match({ type: "x" })).toBe(false);
		});

		it("narrows the payload type", () => {
			const added = createAction<number, "counter/added">("counter/added");
			const action: { type: string; payload?: unknown } = added(3);

			if (added.match(action)) {
				const payload: number = action.payload;
				expect(payload).toBe(3);
			} else {
				expect.unreachable();
			}
		});
	});

	describe("prepare", () => {
		it("builds the payload from the arguments", () => {
			const renamed = createAction("user/renamed", {
				prepare: (id: string, name: string) => ({ payload: { id, name } }),
			});

			expect(renamed("1", "Ann")).toEqual({
				type: "user/renamed",
				payload: { id: "1", name: "Ann" },
			});
		});

		it("keeps the type and match", () => {
			const renamed = createAction("user/renamed", (name: string) => ({
				payload: name,
			}));

			expect(renamed.type).toBe("user/renamed");
			expect(renamed.match(renamed("x"))).toBe(true);
		});

		it("calls prepare each time", () => {
			const prepare = vi.fn((value: number) => ({ payload: value * 2 }));
			const doubled = createAction("counter/doubled", { prepare });
			doubled(1);
			doubled(2);

			expect(prepare).toHaveBeenCalledTimes(2);
		});
	});

	describe("on a bus", () => {
		it("an action can be emitted", () => {
			const bus = createBus<Events>();
			const added = createAction<number, "counter/added">("counter/added");
			const handler = vi.fn();
			bus.on("counter/added", handler);
			bus.emit(added(4));

			expect(handler.mock.calls[0]?.[0]).toBe(4);
		});

		it("the creator can be subscribed to", () => {
			const bus = createBus<Events>();
			const added = createAction<number, "counter/added">("counter/added");
			const handler = vi.fn();
			bus.on(added, handler);
			bus.emit("counter/added", 7);
			bus.emit(added(8));

			expect(handler.mock.calls.map((call) => call[0])).toEqual([7, 8]);
		});

		it("the creator can be unsubscribed from", () => {
			const bus = createBus<Events>();
			const added = createAction<number, "counter/added">("counter/added");
			const handler = vi.fn();
			bus.on(added, handler);
			bus.off(added, handler);
			bus.emit(added(1));

			expect(handler).not.toHaveBeenCalled();
		});

		it("emitting the creator with a payload tells the listeners and returns the action", () => {
			const bus = createBus<Events>();
			const added = createAction<number, "counter/added">("counter/added");
			const handler = vi.fn();
			bus.on(added, handler);
			const result = bus.emit(added, 5);

			expect(handler.mock.calls[0]?.[0]).toBe(5);
			expect(result).toEqual({ type: "counter/added", payload: 5 });
		});

		it("an action with no payload is emitted", () => {
			const bus = createBus<Events>();
			const reset = createAction<void, "counter/reset">("counter/reset");
			const handler = vi.fn();
			bus.on(reset, handler);
			bus.emit(reset());

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("with a handler", () => {
		it("emit runs the handler and returns its result", () => {
			const bus = createBus();
			const double = createAction("math/double", (value: number) => value * 2);

			expect(bus.emit(double(21))).toBe(42);
		});

		it("calling it builds the action and does not run the handler", () => {
			const handler = vi.fn((value: number) => value * 2);
			const double = createAction("math/double", handler);

			expect(double(21)).toEqual({ type: "math/double", payload: 21 });
			expect(handler).not.toHaveBeenCalled();
		});

		it("tells the listeners first, then runs the handler", () => {
			const bus = createBus();
			const order: string[] = [];
			const double = createAction("math/double", (value: number) => {
				order.push("handler");
				return value * 2;
			});
			bus.on(double, () => order.push("listener"));
			bus.emit(double(1));

			expect(order).toEqual(["listener", "handler"]);
		});

		it("gives the handler the payload and a task context", () => {
			const bus = createBus();
			const seen: unknown[] = [];
			const probe = createAction("probe", (value: string, ctx) => {
				seen.push(value, typeof ctx.emit, ctx.signal.aborted);
			});
			bus.emit(probe("x"));

			expect(seen).toEqual(["x", "function", false]);
		});

		it("accepts the handler in the options object", () => {
			const bus = createBus();
			const double = createAction("math/double", {
				handle: (value: number) => value * 2,
			});

			expect(bus.emit(double(4))).toBe(8);
		});

		it("works under a policy", async () => {
			const bus = createBus();
			const results: string[] = [];
			const search = createAction(
				"search",
				latest(async (query: string, ctx) => {
					await new Promise((resolve) =>
						setTimeout(resolve, query === "a" ? 20 : 1),
					);
					return ctx.signal.aborted ? "aborted" : query;
				}),
			);
			const first = bus.emit(search("a"));
			const second = bus.emit(search("b"));
			results.push(...(await Promise.all([first, second])).map(String));

			expect(results).toEqual(["undefined", "b"]);
		});

		it("still has type and match", () => {
			const double = createAction("math/double", (value: number) => value * 2);

			expect(double.type).toBe("math/double");
			expect(double.match({ type: "math/double", payload: 1 })).toBe(true);
			expect(double.match({ type: "other" })).toBe(false);
		});
	});

	describe("without a handler", () => {
		it("is an event: onUnhandled hears about it and nothing throws", () => {
			const onUnhandled = vi.fn();
			const bus = createBus({ onUnhandled });
			const loaded = createAction<number>("user/loaded");

			expect(() => bus.emit(loaded(1))).not.toThrow();
			expect(onUnhandled).toHaveBeenCalledTimes(1);
		});

		it("runs a handler bound in the registry, without onUnhandled", () => {
			const onUnhandled = vi.fn();
			const bus = createBus({ onUnhandled });
			const actions = bus.use(actionsPlugin());
			const loaded = createAction<number>("user/loaded");
			actions.handle(loaded, () => "bound");

			expect(bus.emit(loaded(1))).toBe("bound");
			expect(onUnhandled).not.toHaveBeenCalled();
		});
	});

	describe("the options object", () => {
		it("takes handle and prepare out and keeps the rest as the scope", () => {
			const store = { id: 1 };
			const rename = createAction("user/rename", {
				handle: (payload: { id: string; name: string }) => payload.name,
				prepare: (id: string, name: string) => ({ payload: { id, name } }),
				store,
			});

			expect(carriedBy(rename)).toEqual({ store });
			expect(rename("1", "Ann")).toEqual({
				type: "user/rename",
				payload: { id: "1", name: "Ann" },
			});
		});

		it("a scope without handle or prepare stays as it is", () => {
			const scope = { store: 1 };
			const loaded = createAction("user/loaded", scope);

			expect(carriedBy(loaded)).toBe(scope);
		});

		it("a handler and a third argument with prepare and the scope", () => {
			const bus = createBus();
			const rename = createAction(
				"user/rename",
				(payload: { id: string; name: string }) =>
					`${payload.id}:${payload.name}`,
				{
					prepare: (id: string, name: string) => ({ payload: { id, name } }),
					store: 1,
				},
			);

			expect(carriedBy(rename)).toEqual({ store: 1 });
			expect(bus.emit(rename("1", "Ann"))).toBe("1:Ann");
		});

		it("a scope with another function field stays a scope field", () => {
			const format = () => "x";
			const loaded = createAction("user/loaded", { format });

			expect(carriedBy(loaded)).toEqual({ format });
		});

		it("prepare with a handler: two plain objects are arguments, not a context", () => {
			const handler = vi.fn();
			const merge = createAction("merge", {
				handle: handler,
				prepare: (left: object, right: object) => ({
					payload: { ...left, ...right },
				}),
			});

			expect(merge({ a: 1 }, { b: 2 })).toEqual({
				type: "merge",
				payload: { a: 1, b: 2 },
			});
			expect(handler).not.toHaveBeenCalled();
		});
	});
});
