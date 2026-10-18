import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { createAction } from "./action";

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
			const renamed = createAction(
				"user/renamed",
				(id: string, name: string) => ({ payload: { id, name } }),
			);

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
			const doubled = createAction("counter/doubled", prepare);
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
});
