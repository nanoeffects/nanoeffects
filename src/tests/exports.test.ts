import { describe, expect, it } from "vitest";
import * as main from "..";
import * as actions from "../actions";
import * as effects from "../effects";
import * as observable from "../observable";
import * as policies from "../policies";
import * as redux from "../store/redux";
import * as trace from "../trace";

describe("public entries", () => {
	it("main", () => {
		expect(Object.keys(main).sort()).toEqual(["anyEventType", "createBus"]);
	});

	it("effects", () => {
		expect(Object.keys(effects).sort()).toEqual([
			"all",
			"allSettled",
			"cancellable",
			"delay",
			"onAbort",
			"poll",
			"race",
			"retry",
			"take",
			"timeout",
		]);
	});

	it("policies", () => {
		expect(Object.keys(policies).sort()).toEqual([
			"debounce",
			"latest",
			"leading",
			"queue",
			"throttle",
		]);
	});

	it("trace", () => {
		expect(Object.keys(trace).sort()).toEqual([
			"consoleLogger",
			"createTraceRecorder",
			"createTracer",
			"performanceLogger",
			"reduxDevtools",
		]);
	});

	it("observable", () => {
		expect(Object.keys(observable).sort()).toEqual([
			"$$observable",
			"createObserve",
		]);
	});

	it("redux", () => {
		expect(Object.keys(redux).sort()).toEqual([
			"createEffectsMiddleware",
			"nanoeffectsMiddleware",
		]);
	});

	it("actions", () => {
		expect(Object.keys(actions).sort()).toEqual([
			"bindHandler",
			"createAction",
			"createCommand",
			"createCommands",
			"createJob",
			"createModule",
			"registerModules",
		]);
	});
});
