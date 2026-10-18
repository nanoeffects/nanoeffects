import { describe, expect, it } from "vitest";
import * as effects from "./effects";
import * as main from "./index";
import * as policies from "./policies";
import * as trace from "./trace";

describe("public entries", () => {
	it("main", () => {
		expect(Object.keys(main).sort()).toEqual(["anyEventType", "createBus"]);
	});

	it("effects", () => {
		expect(Object.keys(effects).sort()).toEqual([
			"all",
			"cancel",
			"delay",
			"race",
		]);
	});

	it("policies", () => {
		expect(Object.keys(policies).sort()).toEqual([
			"debounce",
			"latest",
			"leading",
			"throttle",
		]);
	});

	it("trace", () => {
		expect(Object.keys(trace).sort()).toEqual([
			"consoleLogger",
			"createTraceRecorder",
			"performanceLogger",
			"reduxDevtools",
		]);
	});
});
