// Tricky cases taken from event emitters: mitt, emittery, nanoevents.
import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { TestEvents } from "./test-helpers";

describe("regressions: event emitters", () => {
	it("a listener that unsubscribes itself does not make the next one skipped (mitt, emittery)", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		const off = bus.on("t", () => {
			calls.push("once");
			off();
		});
		bus.on("t", () => calls.push("next"));
		bus.emit("t", 1);
		bus.emit("t", 2);

		expect(calls).toEqual(["once", "next", "next"]);
	});

	it("a listener subscribed twice is called twice, and one unsubscribe leaves the other", () => {
		const bus = createBus<TestEvents>();
		const handler = vi.fn();
		const offFirst = bus.on("t", handler);
		bus.on("t", handler);
		bus.emit("t", 1);
		offFirst();
		bus.emit("t", 2);

		expect(handler).toHaveBeenCalledTimes(3);
	});

	it("unsubscribing a listener that was never subscribed changes nothing", () => {
		const bus = createBus<TestEvents>();
		const kept = vi.fn();
		bus.on("t", kept);
		bus.off("t", () => {});
		bus.emit("t", 1);

		expect(kept).toHaveBeenCalledTimes(1);
	});

	it("off(event, fn) removes one registration of fn", () => {
		const bus = createBus<TestEvents>();
		const handler = vi.fn();
		bus.on("t", handler);
		bus.on("t", handler);
		bus.off("t", handler);
		bus.emit("t", 1);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("clearing an event during its emit still delivers that emit to every listener", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		bus.on("t", () => {
			calls.push("first");
			bus.off("t");
		});
		bus.on("t", () => calls.push("second"));
		bus.emit("t", 1);
		bus.emit("t", 2);

		expect(calls).toEqual(["first", "second"]);
	});

	it("an event emitted from its own listener is delivered to a snapshot, depth first", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		bus.on("t", (value, ctx) => {
			calls.push(`a${value}`);
			if (value === 1) {
				ctx.emit("t", 2);
			}
		});
		bus.on("t", (value) => calls.push(`b${value}`));
		bus.emit("t", 1);

		expect(calls).toEqual(["a1", "a2", "b2", "b1"]);
	});

	it("tens of thousands of listeners can be added and removed quickly", () => {
		const bus = createBus<TestEvents>();
		let calls = 0;
		// add is outside the budget: the regression is unsubscribe that slows as n grows
		const offs = Array.from({ length: 50_000 }, () =>
			bus.on("t", () => {
				calls += 1;
			}),
		);
		const start = performance.now();
		for (const off of offs) {
			off();
		}

		expect(performance.now() - start).toBeLessThan(2000);
		bus.emit("t", 1);
		expect(calls).toBe(0);
	});

	it("emitting with no listener at all is fine for every kind of event", () => {
		const bus = createBus<TestEvents>();

		expect(() => {
			bus.emit("t", 1);
			bus.emit({ type: "b", payload: "x" });
		}).not.toThrow();
	});
});
