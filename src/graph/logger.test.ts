import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { consoleLogger, createTracer, tracePlugin } from "../trace";
import { graphLogger } from "./logger";
import type { Finding, GraphLoggerOptions } from "./types";

type Events = Record<string, number>;

const setup = (options: GraphLoggerOptions = {}, plugin = true) => {
	const findings: Finding[] = [];
	const warn = vi.fn();
	const graph = graphLogger({
		onCycle: (finding) => findings.push(finding),
		console: { warn },
		...options,
	});
	const bus = createBus<Events>({ trace: createTracer(graph) });
	if (plugin) {
		bus.use(tracePlugin());
	}

	return { bus, graph, findings, warn };
};

const edgeCount = (
	graph: ReturnType<typeof graphLogger>,
	from: string,
	to: string,
) =>
	graph.toJSON().edges.find((edge) => edge.from === from && edge.to === to)
		?.count;

describe("graphLogger: the graph", () => {
	for (const plugin of [true, false]) {
		describe(plugin ? "with tracePlugin" : "without tracePlugin", () => {
			it("holds an edge from the event to the event its handler emitted", () => {
				const { bus, graph } = setup({}, plugin);
				bus.on("a", (_payload, ctx) => {
					ctx.emit("b", 1);
				});
				bus.on("b", () => {});

				bus.emit("a", 1);

				expect(edgeCount(graph, "a", "b")).toBe(1);
			});

			it("counts an edge each time it is seen", () => {
				const { bus, graph } = setup({}, plugin);
				bus.on("a", (_payload, ctx) => {
					ctx.emit("b", 1);
					ctx.emit("b", 2);
					ctx.emit("b", 3);
				});
				bus.on("b", () => {});

				bus.emit("a", 1);

				expect(edgeCount(graph, "a", "b")).toBe(3);
			});

			it("works next to another logger", () => {
				const lines: unknown[] = [];
				const graph = graphLogger({ console: { warn: vi.fn() } });
				const bus = createBus<Events>({
					trace: createTracer([
						consoleLogger({
							console: { debug: (...args) => lines.push(args), error: vi.fn() },
						}),
						graph,
					]),
				});
				if (plugin) {
					bus.use(tracePlugin());
				}
				bus.on("a", () => {});

				bus.emit("a", 1);

				// a plain handler reports no event without tracePlugin, so only the other logger's lines differ
				expect(lines.length > 0).toBe(plugin);
				expect(graph.toJSON().nodes.map((node) => node.name)).toContain("a");
			});
		});
	}

	it("makes a named listener its own node, below its event", () => {
		const { bus, graph } = setup();
		bus.on("total/changed", () => {}, { traceId: "recalc" });
		bus.on("total/changed", () => {}, { traceId: "audit" });

		bus.emit("total/changed", 1);

		const names = graph.toJSON().nodes.map((node) => node.name);
		expect(names).toEqual(expect.arrayContaining(["recalc", "audit"]));
		expect(edgeCount(graph, "total/changed", "recalc")).toBe(1);
		expect(edgeCount(graph, "total/changed", "audit")).toBe(1);
	});

	it("shows an emit that nobody listens to", () => {
		const { bus, graph } = setup();
		bus.on("a", (_payload, ctx) => {
			ctx.emit("lonely", 1);
		});

		bus.emit("a", 1);

		expect(edgeCount(graph, "a", "lonely")).toBe(1);
	});

	it("builds from what the tracer lets through", () => {
		const graph = graphLogger({ console: { warn: vi.fn() } });
		const bus = createBus<Events>({
			trace: createTracer(graph, { sample: 0 }),
		});
		bus.on("a", () => {});

		bus.emit("a", 1);

		expect(graph.toJSON().nodes).toEqual([]);
	});

	it("keeps the same size when the same chain runs 10 000 times", () => {
		const { bus, graph } = setup();
		bus.on("a", (_payload, ctx) => {
			ctx.emit("b", 1);
		});
		bus.on("b", () => {});

		for (let round = 0; round < 10_000; round += 1) {
			bus.emit("a", round);
		}

		expect(graph.toJSON().nodes).toHaveLength(2);
		expect(edgeCount(graph, "a", "b")).toBe(10_000);
	});

	it("forgets everything on clear", () => {
		const { bus, graph } = setup();
		bus.on("a", () => {});
		bus.emit("a", 1);

		graph.clear();

		expect(graph.toJSON().nodes).toEqual([]);
		expect(graph.toJSON().edges).toEqual([]);
		expect(graph.cycles()).toEqual([]);
	});

	it("tells once that tracePlugin is missing", async () => {
		const { bus, warn } = setup({}, false);
		bus.on("a", () => {});

		bus.emit("a", 1);
		bus.emit("a", 2);
		await Promise.resolve();

		const hints = warn.mock.calls.filter((call) =>
			String(call[0]).includes("tracePlugin"),
		);
		expect(hints).toHaveLength(1);
	});

	it("does not tell it with tracePlugin", async () => {
		const { bus, warn } = setup();
		bus.on("a", () => {});

		bus.emit("a", 1);
		await Promise.resolve();

		expect(warn).not.toHaveBeenCalled();
	});
});

describe("graphLogger: where a listener was made", () => {
	it("shows the site of a named listener in a report and in the nodes, when devPlugin is used", async () => {
		const { devPlugin } = await import("../dev");
		const warn = vi.fn();
		const graph = graphLogger({ console: { warn } });
		const bus = createBus<Events>({ trace: createTracer(graph) });
		bus.use(tracePlugin());
		bus.use(devPlugin({ log: () => {} }));
		bus.on(
			"a",
			(round, ctx) => {
				if (round < 20) {
					ctx.emit("a", round + 1);
				}
			},
			{ traceId: "selfLoop" },
		);

		bus.emit("a", 0);

		expect(String(warn.mock.calls[0]?.[0])).toContain("selfLoop at");
		expect(
			graph.toJSON().nodes.find((node) => node.name === "selfLoop")?.site,
		).toContain("logger.test.ts");
	});

	it("has no site without devPlugin", () => {
		const { bus, graph } = setup();
		bus.on("a", () => {}, { traceId: "plain" });
		bus.emit("a", 1);

		expect(
			graph.toJSON().nodes.find((node) => node.name === "plain")?.site,
		).toBeUndefined();
	});
});

describe("anonymous listeners with source", () => {
	it("are two nodes when they listen to one event", () => {
		const graph = graphLogger({ console: { warn: vi.fn() } });
		const bus = createBus<Events>({ trace: createTracer(graph) });
		bus.use(tracePlugin({ source: true }));
		bus.on("cart/added", () => {});
		bus.on("cart/added", () => {});

		bus.emit("cart/added", 1);

		const names = graph.toJSON().nodes.map((node) => node.name);
		expect(names).toContain("cart/added#1");
		expect(names).toContain("cart/added#2");
	});
});
