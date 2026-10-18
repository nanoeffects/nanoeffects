import { describe, expect, it, vi } from "vitest";
import { createAction } from "../../actions";
import { createBus } from "../../core/bus";
import { latest } from "../../policies";
import { deferred } from "../../tests/test-helpers";
import { nanoeffectsMiddleware } from "./middleware";

type State = { count: number };
type Events = { "counter/added": number; "counter/reset": undefined };

// the smallest store that has what the middleware needs: reducer, dispatch, middleware
const createMiniStore = (
	middleware: ReturnType<ReturnType<typeof nanoeffectsMiddleware>>,
) => {
	let state: State = { count: 0 };
	const reduce = (action: { type: string; payload?: unknown }) => {
		if (action.type === "counter/added") {
			state = { count: state.count + Number(action.payload) };
		}
		if (action.type === "counter/reset") {
			state = { count: 0 };
		}
	};
	const dispatch = middleware((action: unknown) => {
		reduce(action as { type: string; payload?: unknown });
		return action;
	});

	// `name` makes it fit the `store` field that other tests declare on the context
	return { name: "mini", dispatch, getState: () => state };
};

const added = createAction<number, "counter/added">("counter/added");
const reset = createAction<void, "counter/reset">("counter/reset");

const setup = (options?: Parameters<typeof nanoeffectsMiddleware>[1]) => {
	const bus = createBus<Events>();
	const store = createMiniStore(nanoeffectsMiddleware(bus, options)());

	return { bus, store };
};

describe("nanoeffectsMiddleware", () => {
	it("sends the dispatched actions to the bus", () => {
		const { bus, store } = setup();
		const seen: number[] = [];
		bus.on(added, (value) => {
			seen.push(value);
		});
		store.dispatch(added(2));
		store.dispatch(added(3));

		expect(seen).toEqual([2, 3]);
	});

	it("sends them after the reducers, so a handler sees the new state", () => {
		const { bus, store } = setup();
		const states: number[] = [];
		bus.on(added, () => {
			states.push(store.getState().count);
		});
		store.dispatch(added(5));

		expect(states).toEqual([5]);
	});

	it("returns what the next middleware returned", () => {
		const { store } = setup();

		expect(store.dispatch(added(1))).toEqual(added(1));
	});

	it("lets values that are not actions through untouched", () => {
		const bus = createBus<Events>();
		const emit = vi.spyOn(bus, "emit");
		const next = vi.fn((value: unknown) => value);
		const dispatch = nanoeffectsMiddleware(bus)()(next);
		const thunk = () => "thunk";

		expect(dispatch(thunk)).toBe(thunk);
		expect(dispatch(null)).toBeNull();
		expect(dispatch("text")).toBe("text");
		expect(next).toHaveBeenCalledTimes(3);
		expect(emit).not.toHaveBeenCalled();
	});

	it("filter keeps actions away from the bus", () => {
		const { bus, store } = setup({
			filter: (action) => action.type !== "counter/reset",
		});
		const handler = vi.fn();
		bus.on(reset, handler);
		store.dispatch(reset());

		expect(handler).not.toHaveBeenCalled();
		expect(store.getState().count).toBe(0);
	});

	it("a handler can dispatch another action to the same store", () => {
		const { bus, store } = setup();
		bus.on(added, (value, ctx) => {
			if (value === 1) {
				store.dispatch(added(10));
			}
			void ctx;
		});
		store.dispatch(added(1));

		expect(store.getState().count).toBe(11);
	});

	it("a handler in latest is aborted by the next action, and its late dispatch is dropped", async () => {
		const { bus, store } = setup();
		const first = deferred<number>();
		const second = deferred<number>();
		const gates = [first, second];
		let index = 0;
		bus.on(
			added,
			latest(async (_, { signal }) => {
				const value = await gates[index++]?.promise;
				if (!signal.aborted) {
					store.dispatch(reset());
				}
				return value;
			}),
		);
		store.dispatch(added(1));
		store.dispatch(added(1));
		first.resolve(1);
		second.resolve(1);
		await Promise.resolve();
		await Promise.resolve();

		expect(store.getState().count).toBe(0);
	});

	it("an error of a handler reaches the caller of dispatch, and the state is already updated", () => {
		const { bus, store } = setup();
		bus.on(added, () => {
			throw new Error("boom");
		});

		expect(() => store.dispatch(added(4))).toThrow("boom");
		expect(store.getState().count).toBe(4);
	});

	it("with onError on the bus a failing handler does not break dispatch", () => {
		const onError = vi.fn();
		const bus = createBus<Events>({ onError });
		const store = createMiniStore(nanoeffectsMiddleware(bus)());
		bus.on(added, () => {
			throw new Error("boom");
		});

		expect(() => store.dispatch(added(4))).not.toThrow();
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it("the bus can get the store lazily through context, and a handler dispatches to it", () => {
		const bus = createBus<Events>({
			context: {
				get store() {
					return store;
				},
			},
		});
		const store = createMiniStore(nanoeffectsMiddleware(bus)());
		bus.on(added, (value, ctx) => {
			if (value === 1) {
				(ctx.store as typeof store).dispatch(added(10));
			}
		});
		store.dispatch(added(1));

		expect(store.getState().count).toBe(11);
	});
});
