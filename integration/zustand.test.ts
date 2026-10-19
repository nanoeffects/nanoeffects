// nanoeffects with the real Zustand (vanilla store): the recipes of docs/stores.md

import { createBus, type WithContext } from "nanoeffects";
import { onAbort } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";
import { describe, expect, it, vi } from "vitest";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

type User = { id: string; name: string };
type State = {
	user: User | null;
	count: number;
	setUser: (user: User | null) => void;
};

const createUserStore = () =>
	createStore<State>((set) => ({
		user: null,
		count: 0,
		setUser: (user) => set({ user }),
	}));

type UserStore = ReturnType<typeof createUserStore>;
type Events = {
	userRequested: string;
	userChanged: User | null;
} & WithContext<{ store: UserStore }>;

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Zustand store in the context", () => {
	it("a handler reads and writes the store through ctx.store", async () => {
		const store = createUserStore();
		const bus = createBus<Events>({ context: { store } });
		bus.on("userRequested", async (id, { store: shared }) => {
			if (shared.getState().user?.id === id) {
				return;
			}
			shared.getState().setUser({ id, name: `user ${id}` });
		});
		bus.emit("userRequested", "1");
		await wait();

		expect(store.getState().user).toEqual({ id: "1", name: "user 1" });
	});

	it("latest with a signal: only the last request is written", async () => {
		const store = createUserStore();
		const bus = createBus<Events>({ context: { store } });
		const requests = new Map<string, (user: User) => void>();
		bus.on(
			"userRequested",
			latest(async (id, { store: shared, signal }) => {
				const user = await new Promise<User>((resolve) =>
					requests.set(id, resolve),
				);
				if (!signal.aborted) {
					shared.getState().setUser(user);
				}
			}),
		);
		bus.emit("userRequested", "1");
		bus.emit("userRequested", "2");
		requests.get("1")?.({ id: "1", name: "first" });
		requests.get("2")?.({ id: "2", name: "second" });
		await wait();

		expect(store.getState().user?.name).toBe("second");
	});

	it("each bus has its own store: a test can give a fake one", () => {
		const first = createUserStore();
		const second = createUserStore();
		const busOne = createBus<Events>({ context: { store: first } });
		const busTwo = createBus<Events>({ context: { store: second } });
		busOne.on("userRequested", (id, { store }) =>
			store.getState().setUser({ id, name: "one" }),
		);
		busTwo.on("userRequested", (id, { store }) =>
			store.getState().setUser({ id, name: "two" }),
		);
		busOne.emit("userRequested", "1");

		expect(first.getState().user?.name).toBe("one");
		expect(second.getState().user).toBeNull();
	});
});

describe("Zustand store to the bus, the recipe", () => {
	it("a change of a part of the state becomes an event", () => {
		const store = createUserStore();
		const bus = createBus<Events>();
		const seen: Array<User | null> = [];
		bus.on("userChanged", (user) => {
			seen.push(user);
		});
		store.subscribe((state, previous) => {
			if (state.user !== previous.user) {
				bus.emit("userChanged", state.user);
			}
		});
		store.setState({ count: 5 });
		store.getState().setUser({ id: "1", name: "Ada" });

		expect(seen).toEqual([{ id: "1", name: "Ada" }]);
	});

	it("subscribeWithSelector gives the same in one call", () => {
		const store = createStore<State>()(
			subscribeWithSelector((set) => ({
				user: null,
				count: 0,
				setUser: (user) => set({ user }),
			})),
		);
		const bus = createBus<Events>();
		const handler = vi.fn();
		bus.on("userChanged", handler);
		store.subscribe(
			(state) => state.user,
			(user) => bus.emit("userChanged", user),
		);
		store.setState({ count: 1 });
		store.getState().setUser({ id: "2", name: "Bob" });

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("the subscription ends with the task, through onAbort", () => {
		const store = createUserStore();
		const bus = createBus<Events>();
		const handler = vi.fn();
		bus.on("userChanged", handler);
		const controller = new AbortController();
		const stop = store.subscribe((state, previous) => {
			if (state.user !== previous.user) {
				bus.emit("userChanged", state.user);
			}
		});
		onAbort(controller, stop);
		store.getState().setUser({ id: "1", name: "a" });
		controller.abort();
		store.getState().setUser({ id: "2", name: "b" });

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("a handler that sets another part of the state does not loop", () => {
		const store = createUserStore();
		const bus = createBus<Events>({ context: { store } });
		store.subscribe((state, previous) => {
			if (state.user !== previous.user) {
				bus.emit("userChanged", state.user);
			}
		});
		const handler = vi.fn(
			(user: User | null, { store: shared }: { store: UserStore }) => {
				shared.setState({ count: user ? 1 : 0 });
			},
		);
		bus.on("userChanged", handler);
		store.getState().setUser({ id: "1", name: "a" });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(store.getState().count).toBe(1);
	});
});
