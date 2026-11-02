import { describe, expect, it } from "vitest";
import { run as assertNoCycles } from "../../examples/debug/src/assert-no-cycles";
import { run as chainBroken } from "../../examples/debug/src/chain-broken";
import { run as cleanFlow } from "../../examples/debug/src/clean-flow";
import { run as exportGraph } from "../../examples/debug/src/export-graph";
import { run as failingHandler } from "../../examples/debug/src/failing-handler";
import { run as findOrphansExample } from "../../examples/debug/src/find-orphans";
import { run as hostilePayloads } from "../../examples/debug/src/hostile-payloads";
import { run as ignoreRecursion } from "../../examples/debug/src/ignore-recursion";
import { run as loopAsync } from "../../examples/debug/src/loop-async";
import { run as loopMicrotask } from "../../examples/debug/src/loop-microtask";
import { run as loopModules } from "../../examples/debug/src/loop-modules";
import { run as loopSameEvent } from "../../examples/debug/src/loop-same-event";
import { run as loopTwoHandlers } from "../../examples/debug/src/loop-two-handlers";
import { scenarios } from "../../examples/debug/src/run-all";
import { run as stormComponent } from "../../examples/debug/src/storm-component";

// The debugging examples run on their own and give the same result each time; a scenario that stops finding its loop fails here.

const pathsOf = (result: { findings: Array<{ path: string[] }> }) =>
	result.findings.map((finding) => finding.path);

describe("examples/debug", () => {
	it("loop-two-handlers finds the loop between the cart and the total", () => {
		expect(pathsOf(loopTwoHandlers())).toEqual([
			["cart/changed", "total/changed", "cart/changed"],
		]);
	});

	it("loop-same-event finds the handler that emits its own event", () => {
		expect(pathsOf(loopSameEvent())).toEqual([["clear", "clear"]]);
	});

	it("loop-async finds a loop across await and timers", async () => {
		const result = await loopAsync();

		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.path.at(0)).toBe(
			result.findings[0]?.path.at(-1),
		);
	});

	it("loop-modules finds the loop across two modules, grouped in the diagram", () => {
		const result = loopModules();

		expect(result.findings).toHaveLength(1);
		expect(result.mermaid).toContain("subgraph");
	});

	it("loop-microtask: the guard cuts a loop that the free bus lets run", async () => {
		const result = await loopMicrotask();

		expect(result.notes[0]).toContain("ran 500 times");
		expect(result.notes[1]).toContain("ran 50 times");
	});

	it("storm-component: the free bus handles every emit, the limited one stops at 100", () => {
		const result = stormComponent();

		expect(result.findings.length).toBeGreaterThanOrEqual(0);
		expect(result.notes[1]).toContain("300, with maxPerSecond: 100 → 100");
	});

	it("chain-broken: the loop runs and the graph sees no cycle", async () => {
		const result = await chainBroken();

		expect(result.findings).toEqual([]);
		expect(result.notes[0]).toContain("9 times");
	});

	it("export-graph gives three valid formats", () => {
		const result = exportGraph();

		expect(result.mermaid.startsWith("flowchart")).toBe(true);
		expect(result.dot.startsWith("digraph")).toBe(true);
		expect(() => JSON.stringify(result.json)).not.toThrow();
		expect(result.findings).toHaveLength(1);
	});

	it("hostile-payloads: every awkward payload comes out as safe JSON", () => {
		const result = hostilePayloads();
		const payload = JSON.parse(result.safe) as {
			payload: Record<string, unknown>;
		};

		expect(payload.payload.self).toBe("[Circular]");
		expect(payload.payload.user).toEqual({ $class: "User", name: "Ann" });
		expect(payload.payload.tags).toEqual({ $map: [["a", 1]] });
		expect(payload.payload.failure).toMatchObject({
			name: "Error",
			message: "boom",
		});
	});

	it("find-orphans: a merge removes the false orphans", () => {
		const { notes } = findOrphansExample();

		expect(notes[0]).toBe(
			"one session: resetTotal (unemitted), sendReceipt (unemitted)",
		);
		expect(notes[1]).toBe("both sessions: sendReceipt (unemitted)");
	});

	it("clean-flow reports nothing and marks no edge", () => {
		const result = cleanFlow();

		expect(result.findings).toEqual([]);
		expect(result.mermaid).not.toContain("linkStyle");
	});

	it("ignore-recursion: reported without ignore, quiet with it", () => {
		const result = ignoreRecursion();

		expect(result.findings).toEqual([]);
		expect(result.notes[0]).toContain(
			"without ignore: 1 finding(s); with ignore: 0",
		);
	});

	it("failing-handler: no false loop after failures", () => {
		expect(failingHandler().findings).toEqual([]);
	});

	it("assert-no-cycles passes on a clean flow", () => {
		expect(assertNoCycles().notes[0]).toBe("assertNoCycles passed");
	});

	it("every scenario gives the same result twice", async () => {
		for (const [name, run] of Object.entries(scenarios)) {
			const first = await run({ print: false });
			const second = await run({ print: false });

			expect(second.findings, name).toEqual(first.findings);
			expect(second.mermaid, name).toBe(first.mermaid);
		}
	});
});
