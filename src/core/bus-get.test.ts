import { describe, expect, it } from "vitest";
import { createAction, createModule, modulePlugin } from "../actions";
import { createBus } from "./bus";

describe("bus.get", () => {
	it("gives the listeners of an event, and none for an event never heard", () => {
		const bus = createBus();
		const handler = () => {};

		expect(bus.get("saved")).toEqual([]);
		bus.on("saved", handler);
		expect(bus.get("saved")).toEqual([handler]);
	});

	it("drops a listener when it is unbound", () => {
		const bus = createBus();
		const unbind = bus.on("saved", () => {});

		expect(bus.get("saved")).toHaveLength(1);
		unbind();
		expect(bus.get("saved")).toHaveLength(0);
	});

	it("lists the same function once for each registration", () => {
		const bus = createBus();
		const handler = () => {};
		const unbind = bus.on("saved", handler);
		bus.on("saved", handler);

		expect(bus.get("saved")).toHaveLength(2);
		unbind();
		expect(bus.get("saved")).toHaveLength(1);
	});

	it("keeps the any-event listeners apart from a named event", () => {
		const bus = createBus();
		bus.on("*", () => {});
		bus.on("saved", () => {});

		expect(bus.get("*")).toHaveLength(1);
		expect(bus.get("saved")).toHaveLength(1);
		expect(bus.get("other")).toHaveLength(0);
	});

	it("gives every listener of every event when no name is given", () => {
		const bus = createBus();
		expect(bus.get()).toEqual([]);

		const first = () => {};
		const second = () => {};
		const third = () => {};
		bus.on("saved", first);
		bus.on("deleted", second);
		bus.on("*", third);

		expect(bus.get()).toEqual([first, second, third]);
		bus.off();
		expect(bus.get()).toEqual([]);
	});

	it("reads the type of an action creator", () => {
		const bus = createBus();
		const saved = createAction("saved");
		bus.on(saved, () => {});

		expect(bus.get(saved.type)).toHaveLength(1);
	});

	it("counts a once listener until it runs", () => {
		const bus = createBus();
		bus.once("saved", () => {});

		expect(bus.get("saved")).toHaveLength(1);
		bus.emit("saved");
		expect(bus.get("saved")).toHaveLength(0);
	});

	it("counts a once listener that is unbound before it runs as gone", () => {
		const bus = createBus();
		const unbind = bus.once("saved", () => {});
		unbind();

		expect(bus.get("saved")).toHaveLength(0);
	});

	it("follows off(event) and off()", () => {
		const bus = createBus();
		bus.on("saved", () => {});
		bus.on("saved", () => {});
		bus.on("*", () => {});

		bus.off("saved");
		expect(bus.get("saved")).toHaveLength(0);
		expect(bus.get("*")).toHaveLength(1);
		bus.off();
		expect(bus.get("*")).toHaveLength(0);
	});

	it("hands out an array that a later change does not touch", () => {
		const bus = createBus();
		bus.on("saved", () => {});
		const before = bus.get("saved");
		bus.on("saved", () => {});

		expect(before).toHaveLength(1);
		expect(bus.get("saved")).toHaveLength(2);
	});

	it("is empty again after a module unmounts", () => {
		const bus = createBus();
		const app = bus.use(modulePlugin());
		const feature = createModule("feature", (module) => {
			module.on("saved", () => {});
			module.on("deleted", () => {});
		});

		const unmount = app.mount(feature);
		expect(bus.get("saved")).toHaveLength(1);
		expect(bus.get("deleted")).toHaveLength(1);
		unmount();
		expect(bus.get("saved")).toHaveLength(0);
		expect(bus.get("deleted")).toHaveLength(0);
	});

	it("is empty again after the task that subscribed aborts", () => {
		const bus = createBus();
		let abort = () => {};
		bus.on("start", (_payload, ctx) => {
			ctx.on("saved", () => {});
			abort = ctx.abort;
		});
		bus.emit("start");

		expect(bus.get("saved")).toHaveLength(1);
		abort();
		expect(bus.get("saved")).toHaveLength(0);
	});

	it("sees a listener that modulePlugin holds until the app starts", () => {
		const bus = createBus();
		bus.use(modulePlugin());
		bus.on("saved", () => {});

		expect(bus.get("saved")).toHaveLength(1);
	});
});
