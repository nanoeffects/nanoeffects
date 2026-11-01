import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { createTracer, tracePlugin } from "../trace";
import { graphLogger } from "./logger";

type Events = Record<string, unknown>;

const flow = (names: { first?: string; second?: string } = {}) => {
	const graph = graphLogger({
		console: { warn: vi.fn() },
		onCycle: () => {},
		...names,
	});
	const bus = createBus<Events>({ trace: createTracer(graph) });
	bus.use(tracePlugin());

	return { bus, graph };
};

const small = () => {
	const { bus, graph } = flow();
	bus.on("a", (_payload, ctx) => {
		ctx.emit("b", 1);
		ctx.emit("b", 2);
	});
	bus.on("b", () => {});
	bus.emit("a", 1);

	return graph;
};

const loop = () => {
	const { bus, graph } = flow();
	bus.on("a", (round, ctx) => {
		if ((round as number) < 20) {
			ctx.emit("b", (round as number) + 1);
		}
	});
	bus.on("b", (round, ctx) => {
		ctx.emit("a", round);
	});
	bus.emit("a", 0);

	return graph;
};

describe("toMermaid", () => {
	it("is a flowchart with the count on each edge", () => {
		const text = small().toMermaid();

		expect(text.startsWith("flowchart")).toBe(true);
		expect(text).toContain("-->|x2|");
		expect(text).toMatchInlineSnapshot(`
			"flowchart LR
			  n0["a"]
			  n1["b"]
			  n0 -->|x2| n1"
		`);
	});

	it("marks the edges of a cycle", () => {
		const text = loop().toMermaid();

		expect(text).toContain("linkStyle");
		expect(text).toContain("stroke:red");
	});

	it("does not mark anything when there is no cycle", () => {
		expect(small().toMermaid()).not.toContain("linkStyle");
	});

	it("keeps the output valid for awkward names", () => {
		const { bus, graph } = flow();
		for (const name of [
			'say "hi"',
			"a]b",
			"line\nbreak",
			"<tag>",
			"",
			"ünï — 日本語",
		]) {
			bus.on(name, () => {});
			bus.emit(name, 1);
		}
		const text = graph.toMermaid();

		expect(text).not.toContain('"hi"');
		expect(text.split("\n").every((line) => !line.includes("\r"))).toBe(true);
		expect(text).toContain("#quot;");
		expect(text).toContain("日本語");
		// a label stays on one line
		expect(text.match(/\["[^\n"]*"\]/g)?.length).toBe(6);
	});

	it("puts nodes of a group in a subgraph", () => {
		const { bus, graph } = flow();
		bus.on("cart/changed", (_p, ctx) => {
			ctx.emit("total/changed", 1);
		});
		bus.on("total/changed", () => {});
		bus.emit("cart/changed", 1);

		const text = graph.toMermaid({ group: "prefix" });

		expect(text).toContain("subgraph g_");
		expect(text).toContain('["cart"]');
		expect(text).toContain('["total"]');
	});

	it("takes a function to group by", () => {
		const text = small().toMermaid({
			group: (name) => (name === "a" ? "first" : void 0),
		});

		expect(text).toContain('["first"]');
	});
});

describe("toDot", () => {
	it("is a digraph with the count on each edge", () => {
		expect(small().toDot()).toMatchInlineSnapshot(`
			"digraph events {
			  n0 [label="a"];
			  n1 [label="b"];
			  n0 -> n1 [label="x2"];
			}"
		`);
	});

	it("marks cycle edges red", () => {
		expect(loop().toDot()).toContain("color=red");
	});

	it("escapes quotes, backslashes and line breaks", () => {
		const { bus, graph } = flow();
		bus.on('a"b\\c\nd', () => {});
		bus.emit('a"b\\c\nd', 1);

		expect(graph.toDot()).toContain('label="a\\"b\\\\c\\nd"');
	});

	it("puts the name of the logger in the label", () => {
		const { graph } = flow({ name: "cart" } as never);

		expect(graph.toDot()).toContain('label="cart"');
	});
});

describe("toJSON", () => {
	it("is plain data that JSON.stringify takes, with nodes, edges and cycles", () => {
		const data = loop().toJSON();

		expect(() => JSON.stringify(data)).not.toThrow();
		expect(data.nodes.map((node) => node.name).sort()).toEqual(["a", "b"]);
		expect(data.edges.every((edge) => typeof edge.count === "number")).toBe(
			true,
		);
		expect(data.cycles).toHaveLength(1);
	});

	it("leaves the payloads out by default", () => {
		const { bus, graph } = flow();
		bus.on("login", () => {});
		bus.emit("login", { password: "hunter2" });

		expect(JSON.stringify(graph.toJSON())).not.toContain("hunter2");
	});

	it("adds the last payload, made safe, when asked", () => {
		const { bus, graph } = flow();
		const hostile: { self?: unknown; when: Map<string, number> } = {
			when: new Map([["k", 1]]),
		};
		hostile.self = hostile;
		bus.on("login", () => {});
		bus.emit("login", hostile);

		const data = graph.toJSON({ payload: true });
		const node = data.nodes.find((entry) => entry.name === "login");

		expect(() => JSON.stringify(data)).not.toThrow();
		expect(node?.last?.payload).toEqual({
			when: { $map: [["k", 1]] },
			self: "[Circular]",
		});
	});
});
