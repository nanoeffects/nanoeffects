// @vitest-environment happy-dom
import { act, createElement } from "react";
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
import { batch } from "../policies/batch";
import { dedupe } from "../policies/dedupe";
import { distinct } from "../policies/distinct";
import { rateLimit } from "../policies/rate-limit";
import type { PolicyFunction } from "../policies/with-policy";
import { usePolicy } from "./use-policy";

// The state of dedupe, distinct, rateLimit and batch has to survive a re-render, as the state of debounce does.

type Make<P> = (task: Task<P, EventMap, unknown>) => Task<P, EventMap, unknown>;

const mountWith = <P>(initial: (value: P) => unknown, make: Make<P>) => {
	const container = document.createElement("div");
	const root = createRoot(container);
	const seen: Array<PolicyFunction<P, unknown>> = [];

	const Component = ({ callback }: { callback: (value: P) => unknown }) => {
		const onChange = usePolicy(callback, make, []);
		seen.push(onChange);
		return createElement("span", null, "x");
	};

	const render = (callback: (value: P) => unknown) => {
		act(() => {
			root.render(createElement(Component, { callback }));
		});
	};
	render(initial);

	return {
		render,
		unmount: () => act(() => root.unmount()),
		current: () => seen[seen.length - 1] as PolicyFunction<P, unknown>,
	};
};

describe("usePolicy with the newer policies", () => {
	beforeAll(() => {
		Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
	});

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("dedupe: a call made after a re-render still shares the run that is going", async () => {
		let release = () => {};
		const callback = vi.fn(
			(_id: number) =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
		);
		const view = mountWith(callback, (task) => dedupe(task));
		view.current()(1);
		view.render(callback);
		view.current()(1);
		release();
		await vi.advanceTimersByTimeAsync(0);

		expect(callback).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it("distinct: the last payload is remembered across a re-render", () => {
		const callback = vi.fn((_text: string) => 1);
		const view = mountWith(callback, (task) => distinct(task));
		view.current()("a");
		view.render(callback);
		view.current()("a");
		view.current()("b");

		expect(callback.mock.calls.map((call) => call[0])).toEqual(["a", "b"]);
		view.unmount();
	});

	it("rateLimit: the window is not reset by a re-render", async () => {
		const callback = vi.fn((_value: number) => 1);
		const view = mountWith(callback, (task) => rateLimit(1, 100, task));
		view.current()(1);
		view.render(callback);
		view.current()(2);

		expect(callback).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(100);
		expect(callback).toHaveBeenCalledTimes(2);
		view.unmount();
	});

	it("batch: payloads from before and after a re-render go in one batch, to the callback of the latest render", async () => {
		const stale = vi.fn();
		const fresh = vi.fn();
		const view = mountWith<number>(
			(value) => stale(value),
			(task) => batch(100, task as never),
		);
		view.current()(1);
		view.render((value) => fresh(value));
		view.current()(2);
		await vi.advanceTimersByTimeAsync(100);

		expect(stale).not.toHaveBeenCalled();
		expect(fresh).toHaveBeenCalledTimes(1);
		expect(fresh.mock.calls[0]?.[0]).toEqual([1, 2]);
		view.unmount();
	});

	it("aborts what is pending when the component unmounts", async () => {
		const callback = vi.fn((_value: number) => 1);
		const view = mountWith<number>(callback, (task) =>
			batch(100, task as never),
		);
		view.current()(1);
		view.unmount();
		await vi.advanceTimersByTimeAsync(200);

		expect(callback).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
});
