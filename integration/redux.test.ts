// nanoeffects with the real Redux Toolkit: the middleware, thunks, slices and their action creators
import {
	configureStore,
	createSlice,
	type PayloadAction,
} from "@reduxjs/toolkit";
import { createBus, type WithContext } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { latest } from "nanoeffects/policies";
import { createEffectsMiddleware, type ReduxStoreApi } from "nanoeffects/redux";
import { describe, expect, it, vi } from "vitest";

type User = { id: string; name: string };
type State = { user: User | null; log: string[] };

const counter = createSlice({
	name: "app",
	initialState: { user: null, log: [] } as State,
	reducers: {
		userRequested: (state, action: PayloadAction<string>) => {
			state.log.push(`requested ${action.payload}`);
		},
		userLoaded: (state, action: PayloadAction<User>) => {
			state.user = action.payload;
			state.log.push(`loaded ${action.payload.name}`);
		},
	},
});
const { userRequested, userLoaded } = counter.actions;

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Redux Toolkit with the effects middleware", () => {
	type Events = {
		"app/userRequested": string;
		"app/userLoaded": User;
	} & WithContext<{ store: ReduxStoreApi<State> }>;

	const setup = () => {
		const bus = createBus<Events>();
		const store = configureStore({
			reducer: counter.reducer,
			middleware: (getDefault) =>
				getDefault().concat(createEffectsMiddleware(bus)),
		});

		return { bus, store };
	};

	it("slice actions reach the bus after the reducer, and a handler can dispatch", async () => {
		const { bus, store } = setup();
		const seen: string[] = [];
		bus.on("app/userRequested", async (id, { store: api }) => {
			seen.push(`log has ${api.getState().log.length} entries`);
			store.dispatch(userLoaded({ id, name: `user ${id}` }));
		});
		store.dispatch(userRequested("1"));
		await wait();

		expect(seen).toEqual(["log has 1 entries"]);
		expect(store.getState().user).toEqual({ id: "1", name: "user 1" });
	});

	it("an action creator of the slice works as the event of its type", () => {
		const { bus, store } = setup();
		const handler = vi.fn();
		bus.on(userRequested, handler);
		store.dispatch(userRequested("7"));

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0]?.[0]).toBe("7");
	});

	it("thunks go through and their actions reach the bus", async () => {
		const { bus, store } = setup();
		const handler = vi.fn();
		bus.on("app/userLoaded", handler);
		await store.dispatch(async (dispatch) => {
			await wait();
			dispatch(userLoaded({ id: "2", name: "late" }));
		});

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("latest aborts the previous request, and only the last result reaches the store", async () => {
		const { bus, store } = setup();
		const requests = new Map<string, (user: User) => void>();
		bus.on(
			"app/userRequested",
			latest(async (id, { store: api, signal }) => {
				const user = await new Promise<User>((resolve) => {
					requests.set(id, resolve);
				});
				if (!signal.aborted) {
					api.dispatch(userLoaded(user));
				}
			}),
		);
		store.dispatch(userRequested("1"));
		store.dispatch(userRequested("2"));
		requests.get("1")?.({ id: "1", name: "first" });
		requests.get("2")?.({ id: "2", name: "second" });
		await wait();

		expect(store.getState().user?.name).toBe("second");
		expect(
			store.getState().log.filter((line) => line.startsWith("loaded")),
		).toEqual(["loaded second"]);
	});

	it("an error of a handler does not break dispatch, and goes to onError", () => {
		const onError = vi.fn();
		const bus = createBus<Events>({ onError });
		const store = configureStore({
			reducer: counter.reducer,
			middleware: (getDefault) =>
				getDefault().concat(createEffectsMiddleware(bus)),
		});
		bus.on("app/userRequested", () => {
			throw new Error("boom");
		});

		expect(() => store.dispatch(userRequested("1"))).not.toThrow();
		expect(onError).toHaveBeenCalledTimes(1);
		expect(store.getState().log).toEqual(["requested 1"]);
	});

	it("the default serializable and immutable checks do not complain", () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const { bus, store } = setup();
		bus.on("app/userRequested", (id, { store: api }) => {
			api.dispatch(userLoaded({ id, name: "x" }));
		});
		store.dispatch(userRequested("1"));

		expect(log).not.toHaveBeenCalled();
		log.mockRestore();
	});

	it("a handler does not loop on the action it handles", () => {
		const { bus, store } = setup();
		const handler = vi.fn(
			(_: string, { store: api }: { store: ReduxStoreApi<State> }) => {
				api.dispatch(userRequested("again"));
			},
		);
		bus.on("app/userRequested", handler);
		store.dispatch(userRequested("1"));

		expect(handler).toHaveBeenCalledTimes(1);
		expect(store.getState().log).toEqual(["requested 1", "requested again"]);
	});
});

describe("Redux Toolkit and nanoeffects actions", () => {
	it("nanoeffects actions are plain actions that the store takes", () => {
		const bumped = createAction<number, "app/bumped">("app/bumped");
		const store = configureStore({
			reducer: (state: number[] = [], action) =>
				bumped.match(action) ? [...state, action.payload] : state,
		});
		store.dispatch(bumped(3));

		expect(store.getState()).toEqual([3]);
	});
});
