// nanoeffects with the real MobX: a store in the context, actions, reaction and flow
import {
	configure,
	flow,
	makeAutoObservable,
	reaction,
	runInAction,
} from "mobx";
import { createBus, type WithContext } from "nanoeffects";
import { onAbort } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type User = { id: string; name: string };

class UserStore {
	user: User | null = null;
	count = 0;

	constructor() {
		makeAutoObservable(this);
	}

	setUser(user: User | null) {
		this.user = user;
	}
}

type Events = {
	userRequested: string;
	userChanged: User | null;
} & WithContext<{ store: UserStore }>;

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("MobX store", () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// MobX warns when state changes outside of an action: the tests must not trigger it
		configure({ enforceActions: "always" });
		warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
		configure({ enforceActions: "observed" });
	});

	it("a handler calls an action of the store from the context", async () => {
		const store = new UserStore();
		const bus = createBus<Events>({ context: { store } });
		bus.on("userRequested", async (id, { store: shared }) => {
			shared.setUser({ id, name: `user ${id}` });
		});
		bus.emit("userRequested", "1");
		await wait();

		expect(store.user).toEqual({ id: "1", name: "user 1" });
	});

	it("latest with a signal: only the last request reaches the store", async () => {
		const store = new UserStore();
		const bus = createBus<Events>({ context: { store } });
		const requests = new Map<string, (user: User) => void>();
		bus.on(
			"userRequested",
			latest(async (id, { store: shared, signal }) => {
				const user = await new Promise<User>((resolve) =>
					requests.set(id, resolve),
				);
				if (!signal.aborted) {
					shared.setUser(user);
				}
			}),
		);
		bus.emit("userRequested", "1");
		bus.emit("userRequested", "2");
		requests.get("1")?.({ id: "1", name: "first" });
		requests.get("2")?.({ id: "2", name: "second" });
		await wait();

		expect(store.user?.name).toBe("second");
	});

	it("a reaction turns a change into an event", () => {
		const store = new UserStore();
		const bus = createBus<Events>();
		const seen: Array<User | null> = [];
		bus.on("userChanged", (user) => {
			seen.push(user);
		});
		const stop = reaction(
			() => store.user,
			(user) => bus.emit("userChanged", user),
		);
		runInAction(() => {
			store.count = 3;
		});
		store.setUser({ id: "1", name: "Ada" });
		stop();
		store.setUser({ id: "2", name: "Bob" });

		expect(seen).toEqual([{ id: "1", name: "Ada" }]);
	});

	it("the reaction ends with the task, through onAbort", () => {
		const store = new UserStore();
		const bus = createBus<Events>();
		const handler = vi.fn();
		bus.on("userChanged", handler);
		const controller = new AbortController();
		onAbort(
			controller,
			reaction(
				() => store.user,
				(user) => bus.emit("userChanged", user),
			),
		);
		store.setUser({ id: "1", name: "a" });
		controller.abort();
		store.setUser({ id: "2", name: "b" });

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("a flow is cancelled with the task", async () => {
		const store = new UserStore();
		const bus = createBus<Events>({ context: { store } });
		const finished = vi.fn();
		const load = flow(function* (target: UserStore) {
			yield new Promise((resolve) => setTimeout(resolve, 20));
			target.setUser({ id: "1", name: "late" });
			finished();
		});
		const controller = new AbortController();
		bus.on("userRequested", (_, { store: shared }) => {
			const promise = load(shared);
			onAbort(controller, () => promise.cancel());
			promise.catch(() => {});
		});
		bus.emit("userRequested", "1");
		controller.abort();
		await new Promise((resolve) => setTimeout(resolve, 40));

		expect(store.user).toBeNull();
		expect(finished).not.toHaveBeenCalled();
	});
});
