import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { tracePlugin } from "../trace/plugin";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { createAction } from "./action";
import { emitterPlugin } from "./emitter";

type Events = {
	"name/changed": string;
	"user/renamed": { id: string; name: string };
};

// a store that calls its subscribers with the new value, and a second argument as Zustand does
const createStore = () => {
	const subscribers: Array<(value: string, previous: string) => void> = [];
	return {
		subscribe: (callback: (value: string, previous: string) => void) => {
			subscribers.push(callback);
		},
		set: (value: string, previous: string) => {
			for (const callback of subscribers) {
				callback(value, previous);
			}
		},
	};
};

describe("emitterPlugin", () => {
	it("returns the same bus", () => {
		const bus = createBus<Events>();

		expect(bus.use(emitterPlugin())).toBe(bus);
	});

	it("a bus without the plugin has no emitter", () => {
		const bus = createBus<Events>();

		expect("emitter" in bus).toBe(false);
	});

	it("emits the action of the creator", () => {
		const bus = createBus<Events>().use(emitterPlugin());
		const nameChanged = createAction("name/changed");
		const handler = vi.fn();
		bus.on(nameChanged, handler);

		const emitNameChanged = bus.emitter(nameChanged);
		emitNameChanged("Eva");

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0]?.[0]).toBe("Eva");
	});

	it("works as a callback of a store, extra arguments are ignored", () => {
		const bus = createBus<Events>().use(emitterPlugin());
		const nameChanged = createAction("name/changed");
		const handler = vi.fn();
		bus.on(nameChanged, handler);
		const store = createStore();

		store.subscribe(bus.emitter(nameChanged));
		store.set("Eva", "Adam");

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0]?.[0]).toBe("Eva");
	});

	it("gives all arguments to a prepare function", () => {
		const bus = createBus<Events>().use(emitterPlugin());
		const renamed = createAction(
			"user/renamed",
			(id: string, name: string) => ({ payload: { id, name } }),
		);
		const handler = vi.fn();
		bus.on(renamed, handler);

		bus.emitter(renamed)("1", "Eva");

		expect(handler.mock.calls[0]?.[0]).toEqual({ id: "1", name: "Eva" });
	});

	it("calling the creator alone does not emit", () => {
		const bus = createBus<Events>().use(emitterPlugin());
		const nameChanged = createAction("name/changed");
		const handler = vi.fn();
		bus.on(nameChanged, handler);

		const action = nameChanged("Eva");

		expect(handler).not.toHaveBeenCalled();
		bus.emit(action);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("emit(creator, payload) reaches the same handlers", () => {
		const bus = createBus<Events>().use(emitterPlugin());
		const nameChanged = createAction("name/changed");
		const handler = vi.fn();
		bus.on(nameChanged, handler);

		bus.emit(nameChanged, "Eva");

		expect(handler.mock.calls[0]?.[0]).toBe("Eva");
	});
	describe("the trace", () => {
		it("makes the emit a child of a root task named by traceId", () => {
			const recorder = createTraceRecorder();
			const bus = createBus<Events>({ trace: createTracer(recorder) })
				.use(tracePlugin())
				.use(emitterPlugin());
			const nameChanged = createAction("name/changed");
			bus.on(nameChanged, () => {});

			bus.emitter(nameChanged, { traceId: "nameStore", traceGroupId: "flow" })(
				"Eva",
			);

			const root = recorder.events.find((event) => event.type === "nameStore");
			expect(root?.effect).toBe("run");
			expect(root?.traceGroupId).toBe("flow");
			expect(root?.payload).toEqual({ type: "name/changed", payload: "Eva" });
		});

		it("emits as before when the bus has no tracer", () => {
			const bus = createBus<Events>().use(emitterPlugin());
			const nameChanged = createAction("name/changed");
			const heard = vi.fn();
			bus.on(nameChanged, heard);

			bus.emitter(nameChanged, { traceId: "nameStore" })("Eva");

			expect(heard).toHaveBeenCalledTimes(1);
			expect(heard.mock.calls[0]?.[0]).toBe("Eva");
		});
	});
});
