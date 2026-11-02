import { describe, expect, it } from "vitest";
import { createBus } from "../core/bus";
import { createTracer, describeBus, tracePlugin } from "../trace";
import { graphLogger } from "./logger";
import { mergeGraphs } from "./merge";
import { findOrphans } from "./orphans";
import type { GraphSnapshot } from "./types";

const graphOf = (...names: string[]): GraphSnapshot => ({
	nodes: names.map((name) => ({ name, count: 1 })),
	edges: [],
	cycles: [],
});

describe("findOrphans", () => {
	it("lists a listener of an emitted event that did not run", () => {
		const described = { "cart/added": ["recalc", "audit"] };

		const orphans = findOrphans(described, graphOf("cart/added", "recalc"));

		expect(orphans).toEqual([
			{ event: "cart/added", listener: "audit", kind: "unrun" },
		]);
	});

	it("lists a listener of an event that was never emitted", () => {
		const described = { "cart/cleared": ["reset"] };

		const orphans = findOrphans(described, graphOf("cart/added"));

		expect(orphans).toEqual([
			{ event: "cart/cleared", listener: "reset", kind: "unemitted" },
		]);
	});

	it("leaves out anonymous listeners", () => {
		const described = { "cart/added": ["<anonymous>"] };

		expect(findOrphans(described, graphOf("cart/added"))).toEqual([]);
	});

	it("returns nothing when every listener ran", () => {
		const described = { "cart/added": ["recalc"] };

		expect(findOrphans(described, graphOf("cart/added", "recalc"))).toEqual([]);
	});

	it("reads a name that describeBus wrote with its source", () => {
		const described = {
			"cart/added": ["recalc (src/cart.ts:12:3)", "audit (src/cart.ts:13:3)"],
		};

		const orphans = findOrphans(described, graphOf("cart/added", "recalc"));

		expect(orphans).toEqual([
			{ event: "cart/added", listener: "audit", kind: "unrun" },
		]);
	});

	it("does not change its arguments", () => {
		const described = { a: ["x"] };
		const snapshot = graphOf("a");

		findOrphans(described, snapshot);

		expect(described).toEqual({ a: ["x"] });
		expect(snapshot).toEqual(graphOf("a"));
	});

	it("sees a listener that ran in only one of two merged runs", () => {
		const described = { "cart/added": ["recalc"] };
		const first = graphOf("cart/added");
		const second = graphOf("cart/added", "recalc");

		expect(findOrphans(described, first)).toHaveLength(1);
		expect(findOrphans(described, mergeGraphs(first, second))).toEqual([]);
	});

	it("matches names from a real bus: a traceId and a function name", () => {
		const graph = graphLogger();
		const bus = createBus<Record<string, number>>({
			trace: createTracer(graph),
		}).use(tracePlugin());
		bus.on("cart/added", function recalc() {});
		bus.on("cart/added", () => {}, { traceId: "audit" });
		bus.on("cart/added", function neverRuns() {}, { traceId: "late" });
		bus.on("cart/cleared", function reset() {});

		bus.emit("cart/added", 1);

		// every listener of `cart/added` ran: they are nodes by the names describeBus prints
		const orphans = findOrphans(describeBus(bus), graph.toJSON());
		expect(orphans).toEqual([
			{ event: "cart/cleared", listener: "reset", kind: "unemitted" },
		]);
	});
});
