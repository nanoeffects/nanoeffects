import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { createAction } from "../actions/action";
import { createBus } from "../core/bus";
import { tracePlugin } from "../trace/plugin";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { vuePlugin } from "./plugin";

type Events = {
	"name/changed": string;
	"profile/changed": { name: string };
	"names/saved": string[];
	"callback/set": () => string;
};

const nameChanged = createAction<string>("name/changed");
const namesSaved = createAction<string[]>("names/saved");

const createApp = () => createBus<Events>().use(vuePlugin());

describe("vuePlugin: watchEmitter", () => {
	it("emits nothing when it is called", async () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);
		const scope = effectScope();
		scope.run(() => app.watchEmitter(ref("Adam"), "name/changed"));
		await nextTick();

		expect(heard).not.toHaveBeenCalled();
		scope.stop();
	});

	it("emits the new value once for a change", async () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);
		const name = ref("Adam");
		const scope = effectScope();
		scope.run(() => app.watchEmitter(name, "name/changed"));

		name.value = "Eve";
		await nextTick();

		expect(heard).toHaveBeenCalledTimes(1);
		expect(heard).toHaveBeenCalledWith("Eve", expect.anything());
		scope.stop();
	});

	it("emits once, with the last value, for several changes in one tick", async () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);
		const name = ref("Adam");
		const scope = effectScope();
		scope.run(() => app.watchEmitter(name, "name/changed"));

		name.value = "Eve";
		name.value = "Ann";
		await nextTick();

		expect(heard).toHaveBeenCalledTimes(1);
		expect(heard).toHaveBeenCalledWith("Ann", expect.anything());
		scope.stop();
	});

	it("takes a getter and an action creator", async () => {
		const app = createApp();
		const heard = vi.fn();
		app.on(nameChanged, heard);
		const name = ref("Adam");
		const scope = effectScope();
		scope.run(() => app.watchEmitter(() => name.value, nameChanged));

		name.value = "Eve";
		await nextTick();

		expect(heard).toHaveBeenCalledTimes(1);
		scope.stop();
	});

	it("emits nothing after its scope is stopped", async () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);
		const name = ref("Adam");
		const scope = effectScope();
		scope.run(() => app.watchEmitter(name, "name/changed"));
		scope.stop();

		name.value = "Eve";
		await nextTick();

		expect(heard).not.toHaveBeenCalled();
	});

	it("returns the function that stops it", async () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);
		const name = ref("Adam");
		const stop = app.watchEmitter(name, "name/changed");
		stop();

		name.value = "Eve";
		await nextTick();

		expect(heard).not.toHaveBeenCalled();
	});

	it("compares with the equals function that is given in the options", async () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("profile/changed", heard);
		const profile = ref({ name: "Adam" });
		const sameName = (previous: { name: string }, next: { name: string }) =>
			previous.name === next.name;
		const scope = effectScope();
		scope.run(() =>
			app.watchEmitter(profile, "profile/changed", { equals: sameName }),
		);

		profile.value = { name: "Adam" };
		await nextTick();
		expect(heard).not.toHaveBeenCalled();

		profile.value = { name: "Eve" };
		await nextTick();
		expect(heard).toHaveBeenCalledTimes(1);
		scope.stop();
	});

	it("gives a function that is taken out of the bus", async () => {
		const app = createApp();
		const { watchEmitter } = app;
		const heard = vi.fn();
		app.on("name/changed", heard);
		const name = ref("Adam");
		const scope = effectScope();
		scope.run(() => watchEmitter(name, "name/changed"));

		name.value = "Eve";
		await nextTick();

		expect(heard).toHaveBeenCalledTimes(1);
		scope.stop();
	});

	it("shows the traceId as the root of the chain in the trace", async () => {
		const recorder = createTraceRecorder();
		const traced = createBus<Events>({ trace: createTracer(recorder) })
			.use(tracePlugin())
			.use(vuePlugin());
		traced.on("name/changed", () => {});
		const name = ref("Adam");
		const scope = effectScope();
		scope.run(() =>
			traced.watchEmitter(name, "name/changed", {
				traceId: "Profile",
				traceGroupId: "checkout",
			}),
		);

		name.value = "Eve";
		await nextTick();

		const root = recorder.events.find((event) => event.type === "Profile");
		expect(root?.effect).toBe("run");
		expect(root?.traceGroupId).toBe("checkout");
		expect(root?.payload).toEqual({ type: "name/changed", payload: "Eve" });
		scope.stop();
	});

	it("ignores the trace options without tracePlugin, also with a tracer", async () => {
		const recorder = createTraceRecorder();
		const traced = createBus<Events>({ trace: createTracer(recorder) }).use(
			vuePlugin(),
		);
		const heard = vi.fn();
		traced.on("name/changed", heard);
		const name = ref("Adam");
		const scope = effectScope();
		scope.run(() =>
			traced.watchEmitter(name, "name/changed", { traceId: "Profile" }),
		);

		name.value = "Eve";
		await nextTick();

		expect(heard).toHaveBeenCalledTimes(1);
		expect(recorder.events.some((event) => event.type === "Profile")).toBe(
			false,
		);
		scope.stop();
	});
});

describe("vuePlugin: useEventRef", () => {
	it("starts as initial and takes the payload of each event", () => {
		const app = createApp();
		const scope = effectScope();
		const names = scope.run(() => app.useEventRef("names/saved", []));

		expect(names?.value).toEqual([]);
		app.emit("names/saved", ["a"]);
		expect(names?.value).toEqual(["a"]);
		scope.stop();
	});

	it("takes the event from an action creator", () => {
		const app = createApp();
		const scope = effectScope();
		const names = scope.run(() => app.useEventRef(namesSaved, []));

		app.emit("names/saved", ["a", "b"]);

		expect(names?.value).toEqual(["a", "b"]);
		scope.stop();
	});

	it("stores a function payload and does not call it", () => {
		const app = createApp();
		const callback = vi.fn(() => "called");
		const scope = effectScope();
		const stored = scope.run(() => app.useEventRef("callback/set", () => "x"));

		app.emit("callback/set", callback);

		expect(stored?.value).toBe(callback);
		expect(callback).not.toHaveBeenCalled();
		scope.stop();
	});

	it("does not see an event that was emitted before the call", () => {
		const app = createApp();
		app.emit("names/saved", ["early"]);
		const scope = effectScope();
		const names = scope.run(() => app.useEventRef("names/saved", []));

		expect(names?.value).toEqual([]);
		scope.stop();
	});

	it("keeps its last value and stops listening when its scope ends", () => {
		const app = createApp();
		const scope = effectScope();
		const names = scope.run(() => app.useEventRef("names/saved", []));

		app.emit("names/saved", ["a"]);
		scope.stop();
		app.emit("names/saved", ["b"]);

		expect(names?.value).toEqual(["a"]);
	});

	it("gives a function that is taken out of the bus", () => {
		const app = createApp();
		const { useEventRef } = app;
		const scope = effectScope();
		const names = scope.run(() => useEventRef("names/saved", []));

		app.emit("names/saved", ["a"]);

		expect(names?.value).toEqual(["a"]);
		scope.stop();
	});
});
