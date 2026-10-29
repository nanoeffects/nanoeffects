import { describe, expect, it, vi } from "vitest";
import { createAction } from "../../actions";
import { createBus } from "../../core/bus";
import { delay, effectsPlugin } from "../../effects";
import { latest } from "../../policies";
import { deferred } from "../../tests/test-helpers";
import { tracePlugin } from "../../trace/plugin";
import { createTraceRecorder } from "../../trace/recorder";
import { createTracer } from "../../trace/tracer";
import { createEffectsMiddleware, type ReduxStoreApi } from "./effects";

type State = { count: number };
type Events = { "counter/added": number; "counter/reset": undefined };
type Middleware = (
	api: ReduxStoreApi<State>,
) => (next: (action: unknown) => unknown) => (action: unknown) => unknown;

// the type of `ctx.store` is the user's to declare; the tests read it as it is
const storeOf = (ctx: object) =>
	Reflect.get(ctx, "store") as ReduxStoreApi<State> | undefined;

const added = createAction<number, "counter/added">("counter/added");
const reset = createAction<void, "counter/reset">("counter/reset");

// the smallest Redux: reducer, dispatch and the middleware chain
const createMiniRedux = (middlewares: Middleware[]) => {
	let state: State = { count: 0 };
	const base = (action: unknown) => {
		const { type, payload } = action as { type: string; payload?: number };
		if (type === "counter/added") {
			state = { count: state.count + Number(payload) };
		}
		if (type === "counter/reset") {
			state = { count: 0 };
		}
		return action;
	};
	const api: ReduxStoreApi<State> = {
		dispatch: (action) => dispatch(action),
		getState: () => state,
	};
	const dispatch = middlewares
		.map((middleware) => middleware(api))
		.reduceRight((next, middleware) => middleware(next), base);

	return { ...api, dispatch };
};

describe("createEffectsMiddleware", () => {
	it("a handler gets the store of the middleware, and sees the state after the reducer", () => {
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus);
		const seen: number[] = [];
		bus.on(added, (_, ctx) => {
			seen.push(storeOf(ctx)?.getState().count ?? -1);
		});
		const store = createMiniRedux([middleware]);
		store.dispatch(added(3));

		expect(seen).toEqual([3]);
	});

	it("a handler can dispatch through ctx.store", () => {
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus);
		bus.on(added, (value, ctx) => {
			const store = storeOf(ctx);
			if (value === 1) {
				store?.dispatch(added(10) as never);
			}
		});
		const store = createMiniRedux([middleware]);
		store.dispatch(added(1));

		expect(store.getState().count).toBe(11);
	});

	it("effects with policies and abort work as on any bus", async () => {
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus);
		const gates = [deferred(), deferred()];
		let index = 0;
		bus.on(
			added,
			latest(async (_, ctx) => {
				await gates[index++]?.promise;
				const store = storeOf(ctx);
				if (!ctx.signal.aborted) {
					store?.dispatch(reset() as never);
				}
			}),
		);
		const store = createMiniRedux([middleware]);
		store.dispatch(added(1));
		store.dispatch(added(1));
		gates[0]?.resolve();
		gates[1]?.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(store.getState().count).toBe(0);
	});

	it("keeps the fields that other plugins and the bus option put on the context", () => {
		const bus = createBus<Events>({ context: { extra: "kept" } }).use(
			effectsPlugin({ delay }),
		);
		const middleware = createEffectsMiddleware(bus);
		const seen: unknown[] = [];
		bus.on(added, (_, ctx) => {
			seen.push(Reflect.get(ctx, "extra"), typeof Reflect.get(ctx, "delay"));
			seen.push(typeof storeOf(ctx)?.dispatch);
		});
		createMiniRedux([middleware]).dispatch(added(1));

		expect(seen).toEqual(["kept", "function", "function"]);
	});

	it("leaves the bus as it was for events that do not come from Redux", () => {
		const bus = createBus<Events>();
		createEffectsMiddleware(bus);
		const handler = vi.fn();
		bus.on(added, handler);
		bus.emit(added(2));

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("takes filter, and the bus keeps its own options", () => {
		const onError = vi.fn();
		const bus = createBus<Events>({ onError });
		const middleware = createEffectsMiddleware(bus, {
			filter: (action) => action.type !== "counter/reset",
		});
		const handler = vi.fn(() => {
			throw new Error("boom");
		});
		bus.on(added, handler);
		bus.on(reset, handler);
		const store = createMiniRedux([middleware]);

		expect(() => store.dispatch(added(1))).not.toThrow();
		store.dispatch(reset());
		expect(handler).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it("ctx.store is not there before the middleware is added to a store", () => {
		const bus = createBus<Events>();
		const _middleware = createEffectsMiddleware(bus);
		let store: unknown = "not run";
		bus.on(added, (_, ctx) => {
			store = storeOf(ctx);
		});
		bus.emit(added(1));

		expect(store).toBeUndefined();
	});
});

describe("createEffectsMiddleware: loops and errors", () => {
	it("an action that a handler dispatches with its own type does not come back", () => {
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus);
		const handler = vi.fn((_value: number, ctx: object) => {
			storeOf(ctx)?.dispatch(added(1) as never);
		});
		bus.on(added, handler);
		const store = createMiniRedux([middleware]);
		store.dispatch(added(1));

		expect(handler).toHaveBeenCalledTimes(1);
		expect(store.getState().count).toBe(2);
	});

	it("an action of another type goes to the bus, so effects can chain", () => {
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus);
		const resets = vi.fn();
		bus.on(added, (_, ctx) => {
			storeOf(ctx)?.dispatch(reset() as never);
		});
		bus.on(reset, resets);
		createMiniRedux([middleware]).dispatch(added(1));

		expect(resets).toHaveBeenCalledTimes(1);
	});

	it("also when the handler dispatches later, after an await", async () => {
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus);
		const handler = vi.fn(async (_value: number, ctx: object) => {
			await Promise.resolve();
			storeOf(ctx)?.dispatch(added(1) as never);
		});
		bus.on(added, handler);
		const store = createMiniRedux([middleware]);
		store.dispatch(added(1));
		await Promise.resolve();
		await Promise.resolve();

		expect(handler).toHaveBeenCalledTimes(1);
		expect(store.getState().count).toBe(2);
	});

	it("an action dispatched from outside the handlers still reaches the bus", () => {
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus);
		const handler = vi.fn();
		bus.on(added, handler);
		const store = createMiniRedux([middleware]);
		store.dispatch(added(1));
		store.dispatch(added(1));

		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("an error of a handler does not break dispatch, and goes to console.error when the bus has no onError", () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus);
		bus.on(added, () => {
			throw new Error("boom");
		});
		const store = createMiniRedux([middleware]);

		expect(() => store.dispatch(added(1))).not.toThrow();
		expect(store.getState().count).toBe(1);
		expect(log).toHaveBeenCalledTimes(1);
		log.mockRestore();
	});

	it("an error of a reducer still reaches the caller of dispatch", () => {
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus);
		const reducerFailure = () => {
			throw new Error("reducer failed");
		};
		const store = createMiniRedux([middleware, () => () => reducerFailure]);

		expect(() => store.dispatch(added(1))).toThrow("reducer failed");
	});
	it("gives its trace options to the root of each action", () => {
		const recorder = createTraceRecorder();
		const bus = createBus<Events>({ trace: createTracer(recorder) });
		bus.use(tracePlugin());
		bus.on(added, () => {});
		const redux = createMiniRedux([
			createEffectsMiddleware(bus, { traceId: "store", traceGroupId: "flow" }),
		]);

		redux.dispatch(added(1));

		const root = recorder.events.find((event) => event.type === "store");
		expect(root?.traceGroupId).toBe("flow");
	});
});
