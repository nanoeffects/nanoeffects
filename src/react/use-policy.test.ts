// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { EventMap, Task } from "../core/types";
import { debounce } from "../policies/debounce";
import type { PolicyFunction } from "../policies/with-policy";
import { usePolicy } from "./use-policy";

type Props = {
	callback: (value: string) => unknown;
	wait?: number;
};

// mounts a component that calls usePolicy with a debounce of `wait`; `render` re-renders it with new props
const mountWith = (initial: Props, strict: boolean, curried: boolean) => {
	const container = document.createElement("div");
	const root = createRoot(container);
	const seen: Array<PolicyFunction<string, unknown>> = [];

	const Component = ({ callback, wait = 100 }: Props) => {
		// the wrapper of `debounce(wait)` is new on every render, as one written in a component
		const make = curried
			? debounce(wait)
			: (task: Task<string, EventMap, unknown>) => debounce(wait, task);
		const onChange = usePolicy(callback, make, [wait]);
		seen.push(onChange);
		return createElement("span", null, "x");
	};

	const render = (props: Props) => {
		const element = createElement(Component, props);
		act(() => {
			root.render(strict ? createElement(StrictMode, null, element) : element);
		});
	};
	render(initial);

	return {
		render,
		unmount: () => act(() => root.unmount()),
		current: () => seen[seen.length - 1] as PolicyFunction<string, unknown>,
		seen,
	};
};

describe.each([
	["make written as (task) => ...", false],
	["make from a policy called without a task", true],
])("usePolicy with %s", (_name, curried) => {
	const mount = (initial: Props, strict = false) =>
		mountWith(initial, strict, curried);

	beforeAll(() => {
		Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
	});

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns the same function across renders", () => {
		const view = mount({ callback: () => 1 });
		view.render({ callback: () => 2 });
		view.render({ callback: () => 3 });

		expect(new Set(view.seen).size).toBe(1);
	});

	it("keeps a pending debounce across a re-render", async () => {
		const callback = vi.fn();
		const view = mount({ callback });
		view.current()("a");
		view.render({ callback });
		view.render({ callback });
		await vi.advanceTimersByTimeAsync(100);

		expect(callback).toHaveBeenCalledTimes(1);
		expect(callback.mock.calls[0]?.[0]).toBe("a");
	});

	it("runs the callback of the latest render, not of the render that made the call", async () => {
		const stale = vi.fn();
		const fresh = vi.fn();
		const view = mount({ callback: stale });
		view.current()("a");
		view.render({ callback: fresh });
		await vi.advanceTimersByTimeAsync(100);

		expect(stale).not.toHaveBeenCalled();
		expect(fresh).toHaveBeenCalledWith("a", expect.anything());
	});

	it("makes a new policy when deps change and cancels the old one", async () => {
		const callback = vi.fn();
		const view = mount({ callback, wait: 100 });
		const first = view.current();
		first("a");
		view.render({ callback, wait: 200 });
		const second = view.current();
		second("b");
		await vi.advanceTimersByTimeAsync(100);
		expect(callback).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(100);

		expect(second).not.toBe(first);
		expect(callback.mock.calls.map(([value]) => value)).toEqual(["b"]);
	});

	it("cancels a pending call on unmount", async () => {
		const callback = vi.fn();
		const view = mount({ callback });
		view.current()("a");
		view.unmount();
		await vi.advanceTimersByTimeAsync(200);

		expect(callback).not.toHaveBeenCalled();
	});

	it("works under StrictMode, where the effect runs twice", async () => {
		const callback = vi.fn();
		const view = mount({ callback }, true);
		view.current()("a");
		await vi.advanceTimersByTimeAsync(100);

		expect(callback).toHaveBeenCalledTimes(1);
		expect(callback.mock.calls[0]?.[0]).toBe("a");
	});
});
