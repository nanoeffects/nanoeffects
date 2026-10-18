import { describe, expect, it } from "vitest";
import { anyEventType, createStore } from "./store";

type Events = { a: number; b: string };

describe("store", () => {
	it("returns an empty list for an unknown key", () => {
		expect(createStore<Events>().get("a")).toEqual([]);
	});

	it("keeps tasks in the order they were added", () => {
		const store = createStore<Events>();
		const first = () => {};
		const second = () => {};
		store.add("a", first);
		store.add("a", second);

		expect(store.get("a")).toEqual([first, second]);
	});

	it("keeps keys apart", () => {
		const store = createStore<Events>();
		const task = () => {};
		store.add("a", task);

		expect(store.get("b")).toEqual([]);
	});

	it("add returns an unsubscribe callback", () => {
		const store = createStore<Events>();
		const task = () => {};
		const unsubscribe = store.add("a", task);
		unsubscribe();

		expect(store.get("a")).toEqual([]);
	});

	it("remove(key, task) removes only that task", () => {
		const store = createStore<Events>();
		const first = () => {};
		const second = () => {};
		store.add("a", first);
		store.add("a", second);
		store.remove("a", first);

		expect(store.get("a")).toEqual([second]);
	});

	it("remove(key) removes every task of the key", () => {
		const store = createStore<Events>();
		store.add("a", () => {});
		store.add("a", () => {});
		store.remove("a");

		expect(store.get("a")).toEqual([]);
	});

	it("does not change a list that was already read", () => {
		const store = createStore<Events>();
		store.add("a", () => {});
		const snapshot = store.get("a");
		store.add("a", () => {});

		expect(snapshot).toHaveLength(1);
		expect(store.get("a")).toHaveLength(2);
	});

	it("supports the any-event key", () => {
		const store = createStore<Events>();
		const task = () => {};
		store.add(anyEventType, task);

		expect(store.get(anyEventType)).toEqual([task]);
	});
});
