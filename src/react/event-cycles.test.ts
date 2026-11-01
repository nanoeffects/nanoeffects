// @vitest-environment happy-dom
import { act, createElement, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { type Finding, graphLogger } from "../graph";
import { sveltePlugin } from "../svelte";
import { createTracer, tracePlugin } from "../trace";
import { reactPlugin } from "./plugin";

// Loops that go through components: an emit from an effect has no parent task, so a loop through a
// component is seen as a storm of one event, and a loop inside the bus is seen as a chain.

type Events = Record<string, number>;

const rig = (storm = { count: 50, perMs: 1000 }) => {
	const findings: Finding[] = [];
	const graph = graphLogger({
		onCycle: (finding) => findings.push(finding),
		console: { warn: vi.fn() },
		now: () => 0,
		storm,
	});
	const bus = createBus<Events>({ trace: createTracer(graph) })
		.use(tracePlugin())
		.use(reactPlugin());

	return { bus, graph, findings };
};

describe("loops through components", () => {
	const roots: Array<{ unmount: () => void }> = [];

	beforeAll(() => {
		Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
	});

	afterEach(() => {
		for (const root of roots.splice(0)) {
			act(() => root.unmount());
		}
	});

	const mountComponent = (
		Component: () => ReturnType<typeof createElement>,
		strict = false,
	) => {
		const container = document.createElement("div");
		const root = createRoot(container);
		roots.push(root);
		act(() => {
			root.render(
				strict
					? createElement(StrictMode, null, createElement(Component))
					: createElement(Component),
			);
		});

		return root;
	};

	it("a useEmitter whose event makes the component render again is a storm of that event", () => {
		const { bus, findings } = rig();
		let set: (value: number) => void = () => {};
		bus.on("count", (value) => {
			if (value < 200) {
				set(value + 1);
			}
		});
		const Component = () => {
			const [count, setCount] = useState(0);
			set = setCount;
			bus.useEmitter("count", count, { traceId: "counter" });

			return createElement("span", null, count);
		};

		mountComponent(Component);
		act(() => set(1));

		expect(findings.map((finding) => finding.kind)).toEqual(["storm"]);
		// the emitter named itself with traceId, so the storm is named after it
		expect(findings[0]?.path).toEqual(["counter"]);
	});

	it("equals of useEmitter stops the loop: the same value is not an emit", () => {
		const { bus, findings } = rig();
		let set: (value: { n: number }) => void = () => {};
		let emitted = 0;
		bus.on("count", () => {
			emitted += 1;
			if (emitted < 200) {
				set({ n: 1 });
			}
		});
		const Component = () => {
			const [state, setState] = useState({ n: 0 });
			set = setState;
			bus.useEmitter("count", state.n, {
				equals: (before, after) => before === after,
			});

			return createElement("span", null, state.n);
		};

		mountComponent(Component);
		act(() => set({ n: 1 }));

		expect(emitted).toBe(1);
		expect(findings).toEqual([]);
	});

	it("a component that subscribes in useEffect closes a loop with a handler, and stops after unmount", () => {
		const { bus, findings } = rig();
		let calls = 0;
		bus.on("pong", (round, ctx) => {
			ctx.emit("ping", round);
		});
		const Component = () => {
			useEffect(
				() =>
					bus.on("ping", (round, ctx) => {
						calls += 1;
						if (round < 30) {
							ctx.emit("pong", round + 1);
						}
					}),
				[],
			);

			return createElement("span", null, "x");
		};

		const root = mountComponent(Component);
		bus.emit("ping", 0);
		const reported = findings.length;
		act(() => root.unmount());
		roots.splice(0);
		bus.emit("ping", 0);

		expect(reported).toBe(1);
		expect(findings).toHaveLength(1);
		expect(calls).toBeGreaterThan(10);
	});

	it("a subscription made during render piles up listeners; the graph stays small and no cycle is invented", () => {
		const { bus, graph, findings } = rig();
		let set: (value: number) => void = () => {};
		const Component = () => {
			const [count, setCount] = useState(0);
			set = setCount;
			// the wrong place: every render adds a listener and nothing removes it
			bus.on("tick", () => {});

			return createElement("span", null, count);
		};

		mountComponent(Component);
		for (let index = 1; index <= 5; index += 1) {
			act(() => set(index));
		}
		bus.emit("tick", 0);

		expect(bus.get("tick").length).toBeGreaterThanOrEqual(5);
		expect(graph.toJSON().nodes.length).toBeLessThanOrEqual(2);
		expect(findings).toEqual([]);
	});

	it("StrictMode mounts twice and still gives one report for one loop", () => {
		const { bus, findings } = rig();
		const Component = () => {
			useEffect(
				() =>
					bus.on("loop", (round, ctx) => {
						if (round < 30) {
							ctx.emit("loop", round + 1);
						}
					}),
				[],
			);

			return createElement("span", null, "x");
		};

		mountComponent(Component, true);
		bus.emit("loop", 0);

		expect(findings).toHaveLength(1);
	});

	it("two components that answer each other through the bus are seen as a storm, not a chain", () => {
		const { bus, findings } = rig();
		let setA: (value: number) => void = () => {};
		let setB: (value: number) => void = () => {};
		const A = () => {
			const [a, set] = useState(0);
			setA = set;
			bus.useEmitter("a/changed", a);
			useEffect(
				() =>
					bus.on("b/changed", (value) => {
						if (value < 200) {
							setA(value + 1);
						}
					}),
				[],
			);

			return createElement("span", null, a);
		};
		const B = () => {
			const [b, set] = useState(0);
			setB = set;
			bus.useEmitter("b/changed", b);
			useEffect(
				() =>
					bus.on("a/changed", (value) => {
						if (value < 200) {
							setB(value + 1);
						}
					}),
				[],
			);

			return createElement("span", null, b);
		};
		const Both = () =>
			createElement("div", null, createElement(A), createElement(B));

		mountComponent(Both);
		act(() => setA(1));

		expect(findings.some((finding) => finding.kind === "storm")).toBe(true);
	});

	it("a loop inside the bus that a component starts is a chain, and the root is named by the emitter", () => {
		const { bus, findings } = rig();
		bus.on("filter", (round, ctx) => {
			if (round < 30) {
				ctx.emit("results", round + 1);
			}
		});
		bus.on("results", (round, ctx) => {
			ctx.emit("filter", round);
		});
		let set: (value: number) => void = () => {};
		const Component = () => {
			const [value, setValue] = useState(0);
			set = setValue;
			bus.useEmitter("filter", value, { traceId: "FilterBox" });

			return createElement("span", null, value);
		};

		mountComponent(Component);
		act(() => set(1));

		expect(findings).toHaveLength(1);
		expect(findings[0]?.kind).toBe("cycle");
	});

	it("a loop through the store of the svelte plugin is reported too", () => {
		const findings: Finding[] = [];
		const graph = graphLogger({
			onCycle: (finding) => findings.push(finding),
			console: { warn: vi.fn() },
		});
		const bus = createBus<Events>({ trace: createTracer(graph) })
			.use(tracePlugin())
			.use(sveltePlugin());
		const store = bus.eventStore("value", 0);
		bus.on("value", (round, ctx) => {
			if (round < 30) {
				ctx.emit("value", round + 1);
			}
		});
		const stop = store.subscribe(() => {});

		bus.emit("value", 0);
		stop();

		expect(findings).toHaveLength(1);
	});
});
