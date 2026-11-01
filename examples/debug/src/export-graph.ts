// Runs a small app and writes its graph as Mermaid, Graphviz and JSON into out/.
import { mkdirSync, writeFileSync } from "node:fs";
import { createDebugBus, type Options, resultOf, runIfMain } from "./harness";

export const run = (options: Options = {}) => {
	const { bus, graph } = createDebugBus(options);

	bus.on("order/placed", (_round, ctx) => {
		ctx.emit("stock/reserved", 1);
		ctx.emit("email/queued", 1);
	});
	bus.on("stock/reserved", () => {});
	bus.on("email/queued", () => {});
	bus.on("cart/changed", (round, ctx) => {
		if (round < 40) {
			ctx.emit("total/changed", round + 1);
		}
	});
	bus.on("total/changed", (round, ctx) => {
		ctx.emit("cart/changed", round);
	});
	bus.emit("order/placed", 0);
	bus.emit("cart/changed", 0);

	const notes: string[] = [];
	if (options.print) {
		mkdirSync("out", { recursive: true });
		writeFileSync("out/graph.mmd", graph.toMermaid());
		writeFileSync("out/graph.dot", graph.toDot());
		writeFileSync("out/graph.json", JSON.stringify(graph.toJSON(), null, 2));
		notes.push(
			"written: out/graph.mmd (Mermaid), out/graph.dot (Graphviz: dot -Tsvg out/graph.dot), out/graph.json",
		);
	}

	return {
		...resultOf(graph, notes),
		dot: graph.toDot(),
		json: graph.toJSON(),
	};
};

runIfMain(import.meta, "export the graph", run);
