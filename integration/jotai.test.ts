// nanoeffects with the real Jotai (vanilla store): atoms, store.get, store.set, store.sub
import { atom, createStore } from "jotai/vanilla";
import { createBus, type WithContext } from "nanoeffects";
import { onAbort } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";
import { describe, expect, it, vi } from "vitest";

type User = { id: string; name: string };
type JotaiStore = ReturnType<typeof createStore>;

const userAtom = atom<User | null>(null);
const countAtom = atom(0);
const nameAtom = atom((get) => get(userAtom)?.name ?? "nobody");

type Events = {
	userRequested: string;
	userChanged: User | null;
} & WithContext<{ store: JotaiStore }>;

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Jotai store in the context", () => {
	it("a handler reads and writes atoms through ctx.store", async () => {
		const store = createStore();
		const bus = createBus<Events>({ context: { store } });
		bus.on("userRequested", async (id, { store: shared }) => {
			if (shared.get(userAtom)?.id === id) {
				return;
			}
			shared.set(userAtom, { id, name: `user ${id}` });
		});
		bus.emit("userRequested", "1");
		await wait();

		expect(store.get(userAtom)).toEqual({ id: "1", name: "user 1" });
		expect(store.get(nameAtom)).toBe("user 1");
	});

	it("latest with a signal: only the last request is written", async () => {
		const store = createStore();
		const bus = createBus<Events>({ context: { store } });
		const requests = new Map<string, (user: User) => void>();
		bus.on(
			"userRequested",
			latest(async (id, { store: shared, signal }) => {
				const user = await new Promise<User>((resolve) =>
					requests.set(id, resolve),
				);
				if (!signal.aborted) {
					shared.set(userAtom, user);
				}
			}),
		);
		bus.emit("userRequested", "1");
		bus.emit("userRequested", "2");
		requests.get("1")?.({ id: "1", name: "first" });
		requests.get("2")?.({ id: "2", name: "second" });
		await wait();

		expect(store.get(userAtom)?.name).toBe("second");
	});

	it("each bus has its own store", () => {
		const first = createStore();
		const second = createStore();
		const busOne = createBus<Events>({ context: { store: first } });
		createBus<Events>({ context: { store: second } });
		busOne.on("userRequested", (id, { store }) =>
			store.set(userAtom, { id, name: "one" }),
		);
		busOne.emit("userRequested", "1");

		expect(first.get(userAtom)?.name).toBe("one");
		expect(second.get(userAtom)).toBeNull();
	});
});

describe("Jotai atom to the bus, the recipe", () => {
	it("store.sub turns a change of an atom into an event", () => {
		const store = createStore();
		const bus = createBus<Events>();
		const seen: Array<User | null> = [];
		bus.on("userChanged", (user) => {
			seen.push(user);
		});
		store.sub(userAtom, () => bus.emit("userChanged", store.get(userAtom)));
		store.set(countAtom, 5);
		store.set(userAtom, { id: "1", name: "Ada" });

		expect(seen).toEqual([{ id: "1", name: "Ada" }]);
	});

	it("the subscription ends with the task, through onAbort", () => {
		const store = createStore();
		const bus = createBus<Events>();
		const handler = vi.fn();
		bus.on("userChanged", handler);
		const controller = new AbortController();
		onAbort(
			controller,
			store.sub(userAtom, () => bus.emit("userChanged", store.get(userAtom))),
		);
		store.set(userAtom, { id: "1", name: "a" });
		controller.abort();
		store.set(userAtom, { id: "2", name: "b" });

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("a derived atom can be watched as well", () => {
		const store = createStore();
		const bus = createBus<Events>();
		const names: string[] = [];
		store.sub(nameAtom, () => names.push(store.get(nameAtom)));
		store.set(userAtom, { id: "1", name: "Ada" });
		store.set(countAtom, 9);

		expect(names).toEqual(["Ada"]);
		expect(bus).toBeDefined();
	});
});
