import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { $$observable, createObserve } from "../observable";

type Events = { a: number; b: string };

describe("observable", () => {
	it("delivers events to a function observer", () => {
		const bus = createBus<Events>();
		const seen: number[] = [];
		createObserve(bus)("a").subscribe((v) => seen.push(v));
		bus.emit("a", 1);
		bus.emit("a", 2);

		expect(seen).toEqual([1, 2]);
	});

	it("delivers events to an observer object", () => {
		const bus = createBus<Events>();
		const next = vi.fn();
		createObserve(bus)("a").subscribe({ next });
		bus.emit("a", 1);

		expect(next.mock.calls[0]?.[0]).toBe(1);
	});

	it("accepts an observer object without next", () => {
		const bus = createBus<Events>();
		createObserve(bus)("a").subscribe({});

		expect(() => bus.emit("a", 1)).not.toThrow();
	});

	it("only sees its own event", () => {
		const bus = createBus<Events>();
		const handler = vi.fn();
		createObserve(bus)("b").subscribe(handler);
		bus.emit("a", 1);

		expect(handler).not.toHaveBeenCalled();
	});

	it("stops after unsubscribe", () => {
		const bus = createBus<Events>();
		const handler = vi.fn();
		const sub = createObserve(bus)("a").subscribe(handler);
		bus.emit("a", 1);
		sub.unsubscribe();
		bus.emit("a", 2);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("supports many subscribers", () => {
		const bus = createBus<Events>();
		const first = vi.fn();
		const second = vi.fn();
		const observable = createObserve(bus)("a");
		observable.subscribe(first);
		const sub = observable.subscribe(second);
		sub.unsubscribe();
		bus.emit("a", 1);

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
	});

	it("is interop-observable: returns itself from the observable symbol", () => {
		const observable = createObserve(createBus<Events>())("a");

		expect(observable[$$observable]?.()).toBe(observable);
	});

	it("uses the standard key when there is no Symbol.observable", () => {
		expect($$observable).toBe("@@observable");
	});
});
