import { describe, expect, it } from "vitest";
import { createBus } from "../core/bus";
import { createTracer, tracePlugin } from "../trace";
import { graphLogger } from "./logger";
import { mergeGraphs } from "./merge";
import type { Finding, GraphSnapshot } from "./types";

const snapshotOf = (parts: Partial<GraphSnapshot> = {}): GraphSnapshot => ({
	nodes: [],
	edges: [],
	cycles: [],
	...parts,
});

const edge = (from: string, to: string, count: number, inCycle = false) => ({
	from,
	to,
	count,
	inCycle,
});

const cycleOf = (path: string[], extra: Partial<Finding> = {}): Finding => ({
	kind: "cycle",
	path,
	repeats: 3,
	turns: 1,
	root: path[0] ?? "",
	source: "chain",
	...extra,
});

describe("mergeGraphs", () => {
	it("adds the counts of the same edge and node", () => {
		const first = snapshotOf({
			nodes: [{ name: "a", count: 2 }],
			edges: [edge("a", "b", 2)],
		});
		const second = snapshotOf({
			nodes: [{ name: "a", count: 3 }],
			edges: [edge("a", "b", 3)],
		});

		const merged = mergeGraphs(first, second);

		expect(merged.edges).toEqual([edge("a", "b", 5)]);
		expect(merged.nodes).toEqual([{ name: "a", count: 5 }]);
	});

	it("keeps the union of nodes and edges", () => {
		const first = snapshotOf({
			nodes: [{ name: "a", count: 1 }],
			edges: [edge("a", "b", 1)],
		});
		const second = snapshotOf({
			nodes: [{ name: "c", count: 1 }],
			edges: [edge("a", "c", 1)],
		});

		const merged = mergeGraphs(first, second);

		expect(merged.nodes.map((node) => node.name)).toEqual(["a", "c"]);
		expect(merged.edges).toHaveLength(2);
	});

	it("keeps an edge marked when any run had it in a cycle", () => {
		const merged = mergeGraphs(
			snapshotOf({ edges: [edge("a", "b", 1, true)] }),
			snapshotOf({ edges: [edge("a", "b", 1)] }),
		);

		expect(merged.edges[0]?.inCycle).toBe(true);
	});

	it("takes the first site and the last payload", () => {
		const first = snapshotOf({
			nodes: [{ name: "a", count: 1, site: "one.ts:1", last: { payload: 1 } }],
		});
		const second = snapshotOf({
			nodes: [{ name: "a", count: 1, site: "two.ts:2", last: { payload: 2 } }],
		});

		const [node] = mergeGraphs(first, second).nodes;

		expect(node?.site).toBe("one.ts:1");
		expect(node?.last).toEqual({ payload: 2 });
	});

	it("keeps the same ring found from another node as one cycle", () => {
		const first = snapshotOf({
			cycles: [cycleOf(["a", "b", "a"], { turns: 2, repeats: 3 })],
		});
		const second = snapshotOf({
			cycles: [cycleOf(["b", "a", "b"], { turns: 4, repeats: 5 })],
		});

		const { cycles } = mergeGraphs(first, second);

		expect(cycles).toHaveLength(1);
		expect(cycles[0]?.turns).toBe(6);
		expect(cycles[0]?.repeats).toBe(5);
	});

	it("keeps storms of different events apart", () => {
		const storm = (event: string): Finding => ({
			kind: "storm",
			path: [event],
			repeats: 100,
			turns: 1,
			root: event,
			source: "chain",
		});

		const { cycles } = mergeGraphs(
			snapshotOf({ cycles: [storm("a")] }),
			snapshotOf({ cycles: [storm("b")] }),
		);

		expect(cycles).toHaveLength(2);
	});

	it("takes the name of the first snapshot that has one", () => {
		const merged = mergeGraphs(
			snapshotOf(),
			snapshotOf({ name: "e2e" }),
			snapshotOf({ name: "unit" }),
		);

		expect(merged.name).toBe("e2e");
	});

	it("does not change the snapshots it gets", () => {
		const first = snapshotOf({
			nodes: [{ name: "a", count: 1 }],
			edges: [edge("a", "b", 1)],
			cycles: [cycleOf(["a", "b", "a"])],
		});
		const copy = structuredClone(first);

		mergeGraphs(first, first);

		expect(first).toEqual(copy);
	});

	it("returns an empty graph for no snapshot", () => {
		expect(mergeGraphs()).toEqual({ nodes: [], edges: [], cycles: [] });
	});

	it("joins the graphs of two real runs, through JSON", () => {
		const run = (event: string) => {
			const graph = graphLogger();
			const bus = createBus<Record<string, number>>({
				trace: createTracer(graph),
			}).use(tracePlugin());
			bus.on("start", (_payload, ctx) => {
				ctx.emit(event, 1);
			});
			bus.on(event, () => {});
			bus.emit("start", 1);

			return graph.toJSON();
		};
		const files = [run("left"), run("right")].map((snapshot) =>
			JSON.stringify(snapshot),
		);
		const snapshots: GraphSnapshot[] = files.map((file) => JSON.parse(file));

		const merged = mergeGraphs(...snapshots);

		expect(merged.edges.map((item) => item.to).sort()).toEqual([
			"left",
			"right",
		]);
		expect(merged.nodes.find((node) => node.name === "start")?.count).toBe(2);
		expect(JSON.parse(JSON.stringify(merged))).toEqual(merged);
	});
});
