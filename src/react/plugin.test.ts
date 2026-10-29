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

describe("reactPlugin: useEventState", () => {
	const roots: Array<{ unmount: () => void }> = [];

	beforeAll(() => {
		Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
	});

	afterEach(() => {
		for (const root of roots.splice(0)) {
			act(() => root.unmount());
		}
	});

	// mounts a component that renders `useHook()` and records every state it sees
	const mountState = <S>(
		useHook: () => [S, (next: S | ((previous: S) => S)) => void],
		strict = true,
	) => {
		const container = document.createElement("div");
		const seen: S[] = [];
		const control = { set: (_next: S | ((previous: S) => S)) => {} };

		const Component = () => {
			const [state, setState] = useHook();
			control.set = setState;
			seen.push(state);
			return createElement("span", null, "x");
		};

		const root = createRoot(container);
		roots.push(root);
		const element = createElement(Component);
		act(() => {
			root.render(strict ? createElement(StrictMode, null, element) : element);
		});

		return { control, root, seen };
	};

	it("returns initial on the first render", () => {
		const app = createApp();
		const { seen } = mountState(() =>
			app.useEventState("name/changed", "Adam"),
		);

		expect(seen.at(0)).toBe("Adam");
		expect(seen.at(-1)).toBe("Adam");
	});

	it("calls a lazy initial once per render pass", () => {
		const app = createApp();
		const initial = vi.fn(() => "Adam");
		const { seen } = mountState(
			() => app.useEventState("name/changed", initial),
			false,
		);

		expect(initial).toHaveBeenCalledTimes(1);
		expect(seen.at(-1)).toBe("Adam");
	});

	it("sets the state to the payload of the event", () => {
		const app = createApp();
		const { seen } = mountState(() =>
			app.useEventState("name/changed", "Adam"),
		);

		act(() => app.emit("name/changed", "Eve"));

		expect(seen.at(-1)).toBe("Eve");
	});

	it("takes the event from an action creator", () => {
		const app = createApp();
		const { seen } = mountState(() => app.useEventState(nameChanged, "Adam"));

		act(() => app.emit("name/changed", "Eve"));

		expect(seen.at(-1)).toBe("Eve");
	});

	it("does not render again for an equal payload", () => {
		const app = createApp();
		const { seen } = mountState(
			() => app.useEventState("name/changed", "Adam"),
			false,
		);
		const before = seen.length;

		act(() => app.emit("name/changed", "Adam"));

		expect(seen.length).toBe(before);
	});

	it("stores a function payload and does not call it", () => {
		type Callbacks = { "callback/set": () => string };
		const app = createBus<Callbacks>().use(reactPlugin());
		const callback = vi.fn(() => "called");
		const { seen } = mountState(() =>
			app.useEventState("callback/set", () => "initial"),
		);

		act(() => app.emit("callback/set", callback));

		expect(seen.at(-1)).toBe(callback);
		expect(callback).not.toHaveBeenCalled();
	});

	it("sets the state locally and emits nothing", () => {
		const app = createApp();
		const heard = vi.fn();
		app.on("name/changed", heard);
		const { control, seen } = mountState(() =>
			app.useEventState("name/changed", "Adam"),
		);

		act(() => control.set("Eve"));

		expect(seen.at(-1)).toBe("Eve");
		expect(heard).not.toHaveBeenCalled();
	});

	it("leaves no listener after unmount", () => {
		const app = createApp();
		const { root, seen } = mountState(
			() => app.useEventState("name/changed", "Adam"),
			false,
		);
		const before = seen.length;

		act(() => root.unmount());
		app.emit("name/changed", "Eve");

		expect(seen.length).toBe(before);
	});

	it("keeps one listener under StrictMode", () => {
		const app = createApp();
		const { seen } = mountState(() =>
			app.useEventState("name/changed", "Adam"),
		);
		const before = seen.length;

		act(() => app.emit("name/changed", "Eve"));

		// one emit: one state change, so one more render pass (two in StrictMode)
		expect(seen.length - before).toBeLessThanOrEqual(2);
		expect(seen.at(-1)).toBe("Eve");
	});

	it("resubscribes when the event changes", () => {
		type TwoEvents = Events & { "other/changed": string };
		const app = createBus<TwoEvents>().use(reactPlugin());
		const seen: string[] = [];
		const Component = ({
			event,
		}: {
			event: "name/changed" | "other/changed";
		}) => {
			const [state] = app.useEventState(event, "none");
			seen.push(state);
			return createElement("span", null, "x");
		};
		const root = createRoot(document.createElement("div"));
		roots.push(root);
		act(() => root.render(createElement(Component, { event: "name/changed" })));
		act(() =>
			root.render(createElement(Component, { event: "other/changed" })),
		);

		act(() => app.emit("name/changed", "old"));
		expect(seen.at(-1)).toBe("none");

		act(() => app.emit("other/changed", "new"));
		expect(seen.at(-1)).toBe("new");
	});

	it("is a free hook when taken from the bus", () => {
		const app = createApp();
		const { useEventState } = app;
		const { seen } = mountState(() => useEventState("name/changed", "Adam"));

		act(() => app.emit("name/changed", "Eve"));

		expect(seen.at(-1)).toBe("Eve");
	});
});
