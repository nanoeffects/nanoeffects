import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createAction } from "../actions/action";
import { createBus } from "../core/bus";
import { sveltePlugin } from "./plugin";

type Events = {
	"names/saved": string[];
	"callback/set": () => string;
};

const namesSaved = createAction<string[]>("names/saved");

const createApp = () => createBus<Events>().use(sveltePlugin());

describe("sveltePlugin: eventStore", () => {
	it("starts as the initial value", () => {
		const app = createApp();
		const store = app.eventStore("names/saved", []);

		expect(get(store)).toEqual([]);
	});

	it("follows the payload of the event", () => {
		const app = createApp();
		const store = app.eventStore(namesSaved, []);
		const seen: string[][] = [];
		const stop = store.subscribe((value) => seen.push(value));
		app.emit("names/saved", ["Adam"]);
		app.emit("names/saved", ["Eve"]);
		stop();

		expect(seen).toEqual([[], ["Adam"], ["Eve"]]);
	});

	it("listens only between the first subscription and the last unsubscription", () => {
		const onUnhandled = vi.fn();
		const app = createBus<Events>({ onUnhandled }).use(sveltePlugin());
		const store = app.eventStore("names/saved", []);
		app.emit("names/saved", ["a"]);
		const first = store.subscribe(() => {});
		const second = store.subscribe(() => {});
		app.emit("names/saved", ["b"]);
		first();
		app.emit("names/saved", ["c"]);
		second();
		app.emit("names/saved", ["d"]);

		// "a" and "d" had no listener; "b" and "c" had the store
		expect(onUnhandled).toHaveBeenCalledTimes(2);
	});

	it("loses an event that came while nothing read the store", () => {
		const app = createApp();
		const store = app.eventStore("names/saved", ["start"]);
		app.emit("names/saved", ["early"]);

		expect(get(store)).toEqual(["start"]);
	});

	it("stores a function payload and does not call it", () => {
		const app = createApp();
		const store = app.eventStore("callback/set", () => "initial");
		const callback = vi.fn(() => "later");
		const stop = store.subscribe(() => {});
		app.emit("callback/set", callback);
		const value = get(store);
		stop();

		expect(value).toBe(callback);
		expect(callback).not.toHaveBeenCalled();
	});

	it("works as a free function taken out of the bus", () => {
		const { eventStore } = createApp();
		const store = eventStore(namesSaved, []);

		expect(get(store)).toEqual([]);
	});
});
