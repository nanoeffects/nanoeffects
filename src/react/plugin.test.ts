// @vitest-environment happy-dom
import { act, createElement, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAction } from "../actions/action";
import { createBus } from "../core/bus";
import { tracePlugin } from "../trace/plugin";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { reactPlugin } from "./plugin";

type Events = {
	"name/changed": string;
	"profile/changed": { name: string };
};

const nameChanged = createAction<string>("name/changed");

const createApp = () => createBus<Events>().use(reactPlugin());

// mounts a component that keeps `initial` in state and hands it to `useHook` on every render
const mount = <V>(initial: V, useHook: (value: V) => void) => {
	const container = document.createElement("div");
	const control = { set: (_next: V) => {} };

	const Component = () => {
		const [value, setValue] = useState(initial);
		control.set = setValue;
		useHook(value);
		return createElement("span", null, "x");
	};

	const root = createRoot(container);
	act(() => {
		root.render(createElement(StrictMode, null, createElement(Component)));
	});

	return { control, root };
};

describe("reactPlugin: useEmitter", () => {
	const roots: Array<{ unmount: () => void }> = [];
	const track = <T extends { root: { unmount: () => void } }>(mounted: T) => {
		roots.push(mounted.root);
		return mounted;
	};

	beforeAll(() => {
		Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
	});

	afterEach(() => {
		for (const root of roots.splice(0)) {
			act(() => root.unmount());
		}
	});

	it("emits nothing on mount, also in StrictMode", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);

		track(mount("Adam", (name) => app.useEmitter("name/changed", name)));

		expect(heard).not.toHaveBeenCalled();
	});

	it("emits once with the new value after a change, also in StrictMode", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);
		const { control } = track(
			mount("Adam", (name) => app.useEmitter("name/changed", name)),
		);

		act(() => control.set("Eve"));

		expect(heard).toHaveBeenCalledTimes(1);
		expect(heard.mock.calls[0]?.[0]).toBe("Eve");
	});

	it("emits nothing for an equal value", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);
		const { control } = track(
			mount("Adam", (name) => app.useEmitter("name/changed", name)),
		);

		act(() => control.set("Adam"));

		expect(heard).not.toHaveBeenCalled();
	});

	it("emits once, with the last value, for several sets before one commit", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);
		const { control } = track(
			mount("Adam", (name) => app.useEmitter("name/changed", name)),
		);

		act(() => {
			control.set("Bob");
			control.set("Eve");
		});

		expect(heard).toHaveBeenCalledTimes(1);
		expect(heard.mock.calls[0]?.[0]).toBe("Eve");
	});

	it("takes an action creator as the event", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on(nameChanged, heard);
		const { control } = track(
			mount("Adam", (name) => app.useEmitter(nameChanged, name)),
		);

		act(() => control.set("Eve"));

		expect(heard).toHaveBeenCalledTimes(1);
		expect(heard.mock.calls[0]?.[0]).toBe("Eve");
	});

	it("works as a free hook after destructuring", () => {
		const app = createApp();
		const { useEmitter } = app;
		const heard = vi.fn();
		app.on("name/changed", heard);
		const { control } = track(
			mount("Adam", (name) => useEmitter("name/changed", name)),
		);

		act(() => control.set("Eve"));

		expect(heard).toHaveBeenCalledTimes(1);
	});

	it("does not emit when only the event function changes between renders", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on(nameChanged, heard);
		const { control } = track(
			mount("Adam", (name) =>
				// a new creator object on each render is not a change of the value
				app.useEmitter(
					Object.assign((...args: [string]) => nameChanged(...args), {
						type: nameChanged.type,
						match: nameChanged.match,
						toString: nameChanged.toString,
					}),
					name,
				),
			),
		);

		act(() => control.set("Adam"));

		expect(heard).not.toHaveBeenCalled();
	});

	it("compares with the equals function that is given in the options", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("profile/changed", heard);
		const sameName = (previous: { name: string }, next: { name: string }) =>
			previous.name === next.name;
		const { control } = track(
			mount({ name: "Adam" }, (profile) =>
				app.useEmitter("profile/changed", profile, { equals: sameName }),
			),
		);

		act(() => control.set({ name: "Adam" }));
		expect(heard).not.toHaveBeenCalled();

		act(() => control.set({ name: "Eve" }));
		expect(heard).toHaveBeenCalledTimes(1);
		expect(heard.mock.calls[0]?.[0]).toEqual({ name: "Eve" });
	});

	it("treats a new object as a change with the default comparison", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("profile/changed", heard);
		const { control } = track(
			mount({ name: "Adam" }, (profile) =>
				app.useEmitter("profile/changed", profile),
			),
		);

		act(() => control.set({ name: "Adam" }));

		expect(heard).toHaveBeenCalledTimes(1);
	});
	it("ignores a function in the place of the options, and compares with Object.is", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("profile/changed", heard);
		const sameName = (previous: { name: string }, next: { name: string }) =>
			previous.name === next.name;
		const { control } = track(
			mount({ name: "Adam" }, (profile) =>
				Reflect.apply(app.useEmitter, app, [
					"profile/changed",
					profile,
					sameName,
				]),
			),
		);

		act(() => control.set({ name: "Adam" }));

		expect(heard).toHaveBeenCalledTimes(1);
	});

	it("shows the traceId as the root of the chain in the trace", () => {
		const recorder = createTraceRecorder();
		const traced = createBus<Events>({ trace: createTracer(recorder) })
			.use(tracePlugin())
			.use(reactPlugin());
		traced.on("name/changed", () => {});
		const { control } = track(
			mount("Adam", (name) =>
				traced.useEmitter("name/changed", name, {
					traceId: "Profile",
					traceGroupId: "checkout",
				}),
			),
		);

		act(() => control.set("Eve"));

		const root = recorder.events.find((event) => event.type === "Profile");
		expect(root?.effect).toBe("run");
		expect(root?.traceGroupId).toBe("checkout");
		expect(root?.payload).toEqual({ type: "name/changed", payload: "Eve" });
	});
	it("ignores the trace options without tracePlugin, also with a tracer", () => {
		const recorder = createTraceRecorder();
		const traced = createBus<Events>({ trace: createTracer(recorder) }).use(
			reactPlugin(),
		);
		const heard = vi.fn();
		traced.on("name/changed", heard);
		const { control } = track(
			mount("Adam", (name) =>
				traced.useEmitter("name/changed", name, {
					traceId: "Profile",
					traceGroupId: "checkout",
				}),
			),
		);

		act(() => control.set("Eve"));

		expect(heard).toHaveBeenCalledTimes(1);
		expect(recorder.events.some((event) => event.type === "Profile")).toBe(
			false,
		);
	});
});
