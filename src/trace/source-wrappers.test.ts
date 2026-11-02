import { describe, expect, it } from "vitest";
import { createModule, modulePlugin } from "../actions";
import { createBus } from "../core/bus";
import { devPlugin } from "../dev";
import { matchPlugin } from "../match";
import { extendBus } from "../oop";
import { signalPlugin } from "../signal";
import { tracePlugin } from "./plugin";
import { createTraceRecorder } from "./recorder";
import { createTracer } from "./tracer";

const here = /source-wrappers\.test\.ts:\d+:\d+$/;

const setup = () => {
	const recorder = createTraceRecorder();
	const bus = createBus({ trace: createTracer(recorder) });

	return { bus, recorder };
};

const sourceOf = (
	recorder: { events: { type: string; source?: string }[] },
	type: string,
) =>
	recorder.events.find(
		(event) => event.type === type && event.source !== void 0,
	)?.source;

describe("the source of a listener registered through a wrapper", () => {
	const wrappers = {
		matchPlugin: (bus: ReturnType<typeof setup>["bus"]) =>
			bus.use(matchPlugin()),
		signalPlugin: (bus: ReturnType<typeof setup>["bus"]) =>
			bus.use(signalPlugin()),
		devPlugin: (bus: ReturnType<typeof setup>["bus"]) =>
			bus.use(devPlugin({ log: () => {} })),
	};

	for (const [name, wrap] of Object.entries(wrappers)) {
		it(`is the line of the call, with ${name} used after tracePlugin`, () => {
			const { bus, recorder } = setup();
			bus.use(tracePlugin({ source: true }));
			wrap(bus);
			function listener() {}
			bus.on("event", listener);

			bus.emit("event");

			expect(sourceOf(recorder, "listener")).toMatch(here);
		});

		it(`is the line of the call, with ${name} used before tracePlugin`, () => {
			const { bus, recorder } = setup();
			wrap(bus);
			bus.use(tracePlugin({ source: true }));
			function listener() {}
			bus.on("event", listener);

			bus.emit("event");

			expect(sourceOf(recorder, "listener")).toMatch(here);
		});
	}

	it("is the line of bus.once through a wrapper", () => {
		const { bus, recorder } = setup();
		bus.use(tracePlugin({ source: true }));
		bus.use(signalPlugin());
		bus.once("event", function onlyOnce() {});

		bus.emit("event");

		expect(sourceOf(recorder, "onlyOnce")).toMatch(here);
	});

	it("is the line of m.on in a module", () => {
		const { bus, recorder } = setup();
		bus.use(tracePlugin({ source: true }));
		const module = createModule("source", (moduleContext) => {
			moduleContext.on("event", function inModule() {});
		});
		bus.use(modulePlugin([module]));

		bus.emit("event");

		expect(sourceOf(recorder, "inModule")).toMatch(here);
	});

	it("is the line of this.on of an instance", () => {
		const { bus, recorder } = setup();
		bus.use(tracePlugin({ source: true }));
		const Service = extendBus(bus, class {});
		const service = new Service();
		service.on("event", function inInstance() {});

		bus.emit("event");

		expect(sourceOf(recorder, "inInstance")).toMatch(here);
	});

	it("is the line of the user's call, not of the replay, for a listener held by modulePlugin", () => {
		const { bus, recorder } = setup();
		bus.use(tracePlugin({ source: true }));
		bus.use(modulePlugin());
		// made before the app starts: held, and replayed on the first emit
		bus.on("event", function held() {});

		bus.emit("event");

		expect(sourceOf(recorder, "held")).toMatch(here);
	});

	it("gives a registration inside a handler its own place", () => {
		const { bus, recorder } = setup();
		bus.use(tracePlugin({ source: true }));
		bus.use(matchPlugin());
		bus.on("outer", function outer() {
			bus.on("inner", function inner() {});
		});

		bus.emit("outer");
		bus.emit("inner");

		expect(sourceOf(recorder, "outer")).toMatch(here);
		expect(sourceOf(recorder, "inner")).toMatch(here);
		expect(sourceOf(recorder, "inner")).not.toBe(sourceOf(recorder, "outer"));
	});
});
