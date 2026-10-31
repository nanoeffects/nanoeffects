import { describe, expect, it } from "vitest";
import * as main from "..";
import * as actions from "../actions";
import * as context from "../context";
import * as dev from "../dev";
import * as effects from "../effects";
import * as match from "../match";
import * as observable from "../observable";
import * as oop from "../oop";
import * as policies from "../policies";
import * as react from "../react";
import * as scope from "../scope";
import * as signal from "../signal";
import * as redux from "../store/redux";
import * as svelte from "../svelte";
import * as trace from "../trace";
import * as vue from "../vue";

describe("public entries", () => {
	it("main", () => {
		expect(Object.keys(main).sort()).toEqual(["createBus"]);
	});

	it("context", () => {
		expect(Object.keys(context).sort()).toEqual(["contextPlugin"]);
	});

	it("effects", () => {
		expect(Object.keys(effects).sort()).toEqual([
			"all",
			"allSettled",
			"backoff",
			"cancellable",
			"delay",
			"effectsPlugin",
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
			"withPolicy",
		]);
	});

	it("trace", () => {
		expect(Object.keys(trace).sort()).toEqual([
			"consoleLogger",
			"createTraceRecorder",
			"createTracer",
			"performanceLogger",
			"reduxDevtools",
			"tracePlugin",
		]);
	});

	it("observable", () => {
		expect(Object.keys(observable).sort()).toEqual([
			"$$observable",
			"Subject",
			"createObserve",
		]);
	});

	it("redux", () => {
		expect(Object.keys(redux).sort()).toEqual(["createEffectsMiddleware"]);
	});

	it("actions", () => {
		expect(Object.keys(actions).sort()).toEqual([
			"actionsPlugin",
			"createAction",
			"createJob",
			"createModule",
			"emitterPlugin",
			"modulePlugin",
			"setHandler",
		]);
	});

	it("scope", () => {
		expect(Object.keys(scope).sort()).toEqual(["effect", "scopePlugin"]);
	});

	it("match", () => {
		expect(Object.keys(match).sort()).toEqual(["matchPlugin"]);
	});

	it("signal", () => {
		expect(Object.keys(signal).sort()).toEqual(["signalPlugin"]);
	});

	it("oop", () => {
		expect(Object.keys(oop).sort()).toEqual([
			"Emitter",
			"On",
			"Once",
			"WithBus",
			"disposeBus",
			"extendBus",
		]);
	});

	it("react", () => {
		expect(Object.keys(react).sort()).toEqual(["reactPlugin", "usePolicy"]);
	});

	it("svelte", () => {
		expect(Object.keys(svelte).sort()).toEqual(["sveltePlugin"]);
	});

	it("vue", () => {
		expect(Object.keys(vue).sort()).toEqual(["vuePlugin"]);
	});

	it("dev", () => {
		expect(Object.keys(dev).sort()).toEqual(["devPlugin"]);
	});
});
