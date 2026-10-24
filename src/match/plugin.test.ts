import { describe, expect, it, vi } from "vitest";
import { createAction, createCommand } from "../actions";
import { createBus } from "../core/bus";
import { latest } from "../policies";
import { type MatchApi, matchPlugin } from ".";

type Events = {
	"user/loaded": { id: string };
	"user/failed": string;
	"order/placed": number;
};

const userEvent = (action: { type: string }) => action.type.startsWith("user/");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = () => createBus<Events>().use(matchPlugin());

describe("matchPlugin", () => {
	it("returns the same bus", () => {
		const bus = createBus<Events>();

		expect(bus.use(matchPlugin())).toBe(bus);
	});

	it("runs the handler for the events the predicate picks, with their payload and context", () => {
		const bus = setup();
		const seen: unknown[] = [];
		bus.on(userEvent, (payload, ctx) => {
			seen.push([ctx.type, payload]);
		});

		bus.emit("user/loaded", { id: "1" });
		bus.emit("order/placed", 5);
		bus.emit("user/failed", "boom");

		expect(seen).toEqual([
			["user/loaded", { id: "1" }],
			["user/failed", "boom"],
		]);
	});

	it("gives the predicate the type and the payload of the event", () => {
		const bus = setup();
		const predicate = vi.fn(() => false);
		bus.on(predicate, () => {});

		bus.emit("order/placed", 7);

		expect(predicate).toHaveBeenCalledWith({
			type: "order/placed",
			payload: 7,
		});
	});

	it("runs after the listeners of the event itself, in order of subscription", () => {
		const bus = setup();
		const order: string[] = [];
		bus.on(userEvent, () => {
			order.push("predicate one");
		});
		bus.on("user/loaded", () => {
			order.push("listener");
		});
		bus.on(userEvent, () => {
			order.push("predicate two");
		});

		bus.emit("user/loaded", { id: "1" });

		expect(order).toEqual(["listener", "predicate one", "predicate two"]);
	});

	it("keeps an action creator and a command working", () => {
		const bus = setup();
		const placed = createAction("order/placed");
		const double = createCommand("math/double", (value: number) => value * 2);
		const seen: unknown[] = [];
		bus.on(placed, (value) => {
			seen.push(["creator", value]);
		});
		bus.on(double, (value) => {
			seen.push(["command", value]);
		});

		bus.emit(placed(1));
		const result = bus.emit(double(21));

		expect(seen).toEqual([
			["creator", 1],
			["command", 21],
		]);
		expect(result).toBe(42);
	});

	it("stops after the function that on returned is called", () => {
		const bus = setup();
		const predicate = vi.fn(() => true);
		const handler = vi.fn();
		const unbind = bus.on(predicate, handler);

		bus.emit("order/placed", 1);
		unbind();
		bus.emit("order/placed", 2);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(predicate).toHaveBeenCalledTimes(1);
	});

	it("works with a policy around the handler", async () => {
		const bus = setup();
		const outcomes: string[] = [];
		bus.on(
			userEvent,
			latest(async (payload, ctx) => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				outcomes.push(
					ctx.signal.aborted ? "aborted" : `done ${String(payload)}`,
				);
			}),
		);

		bus.emit("user/failed", "one");
		bus.emit("user/failed", "two");
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(outcomes).toEqual(["aborted", "done two"]);
	});

	describe("once", () => {
		it("waits for the first event that matches, then stops", () => {
			const bus = setup();
			const seen: unknown[] = [];
			bus.once(userEvent, (payload) => {
				seen.push(payload);
			});

			bus.emit("order/placed", 1);
			bus.emit("user/failed", "first");
			bus.emit("user/failed", "second");

			expect(seen).toEqual(["first"]);
		});

		it("is removed before the handler runs, so a nested emit does not run it again", () => {
			const bus = setup();
			const calls: number[] = [];
			bus.once(userEvent, (_payload, ctx) => {
				calls.push(calls.length);
				ctx.emit("user/failed", "again");
			});

			bus.emit("user/failed", "start");

			expect(calls).toEqual([0]);
		});

		it("keeps once with an event name working", () => {
			const bus = setup();
			const handler = vi.fn();
			bus.once("order/placed", handler);

			bus.emit("order/placed", 1);
			bus.emit("order/placed", 2);

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("off", () => {
		it("removes every handler of a predicate", () => {
			const bus = setup();
			const first = vi.fn();
			const second = vi.fn();
			bus.on(userEvent, first);
			bus.on(userEvent, second);

			bus.off(userEvent);
			bus.emit("user/failed", "x");

			expect(first).not.toHaveBeenCalled();
			expect(second).not.toHaveBeenCalled();
		});

		it("removes one handler of a predicate", () => {
			const bus = setup();
			const first = vi.fn();
			const second = vi.fn();
			bus.on(userEvent, first);
			bus.on(userEvent, second);

			bus.off(userEvent, first);
			bus.emit("user/failed", "x");

			expect(first).not.toHaveBeenCalled();
			expect(second).toHaveBeenCalledTimes(1);
		});

		it("removes one registration of a handler that was added twice", () => {
			const bus = setup();
			const handler = vi.fn();
			bus.on(userEvent, handler);
			bus.on(userEvent, handler);

			bus.off(userEvent, handler);
			bus.emit("user/failed", "x");

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("clears the predicates with off() and keeps off for names working", () => {
			const bus = setup();
			const predicate = vi.fn();
			const named = vi.fn();
			bus.on(userEvent, predicate);
			bus.on("order/placed", named);

			bus.off("order/placed");
			bus.emit("order/placed", 1);
			bus.off();
			bus.emit("user/failed", "x");

			expect(named).not.toHaveBeenCalled();
			expect(predicate).not.toHaveBeenCalled();
		});
	});

	it("ends a subscription made with ctx.on when the task aborts", () => {
		const bus = setup();
		const seen: string[] = [];
		let abort = () => {};
		bus.on("order/placed", (_value, ctx) => {
			abort = () => ctx.abort();
			// the type of ctx.on does not know the predicate, so it is taken as the one of the plugin
			const on = ctx.on as MatchApi<Events>["on"];
			on(userEvent, (payload) => {
				seen.push(String(payload));
			});
		});

		bus.emit("order/placed", 1);
		bus.emit("user/failed", "while open");
		abort();
		bus.emit("user/failed", "after abort");

		expect(seen).toEqual(["while open"]);
	});

	describe("errors", () => {
		it("throws the error of a predicate from emit", () => {
			const bus = setup();
			bus.on(
				() => {
					throw new Error("bad predicate");
				},
				() => {},
			);

			expect(() => bus.emit("order/placed", 1)).toThrow("bad predicate");
		});

		it("passes the error of a predicate to onError and runs the other handlers", () => {
			const errors: unknown[] = [];
			const bus = createBus<Events>({
				onError: (error) => errors.push(error),
			}).use(matchPlugin());
			const other = vi.fn();
			bus.on(
				() => {
					throw new Error("bad predicate");
				},
				() => {},
			);
			bus.on("order/placed", other);

			bus.emit("order/placed", 1);

			expect(errors).toHaveLength(1);
			expect(other).toHaveBeenCalledTimes(1);
		});
	});

	it("counts as a listener for onUnhandled", () => {
		const onUnhandled = vi.fn();
		const bus = createBus<Events>({ onUnhandled }).use(matchPlugin());
		bus.on(
			() => false,
			() => {},
		);

		bus.emit("order/placed", 1);

		expect(onUnhandled).not.toHaveBeenCalled();
	});

	it("makes one task for each event, also when the predicate says no", async () => {
		const bus = setup();
		const contexts = vi.fn();
		bus.on(
			() => false,
			() => {},
		);
		bus.on("*", (_payload, ctx) => {
			contexts(ctx.type);
		});

		bus.emit("order/placed", 1);
		await flush();

		expect(contexts).toHaveBeenCalledWith("order/placed");
	});

	it("does not touch a bus that does not use the plugin", () => {
		const bus = createBus<Events>();
		const handler = vi.fn();
		bus.on("order/placed", handler);

		bus.emit("order/placed", 1);

		expect(handler).toHaveBeenCalledTimes(1);
	});
});
