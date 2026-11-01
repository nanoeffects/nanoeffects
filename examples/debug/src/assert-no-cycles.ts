// The CI recipe: run a flow of the app and fail when the graph has a cycle.
import { createDebugBus, type Options, resultOf, runIfMain } from "./harness";

// the check that a test would call
export const assertNoCycles = (
	graph: ReturnType<typeof createDebugBus>["graph"],
) => {
	const cycles = graph.cycles();
	if (cycles.length > 0) {
		throw new Error(
			`event cycles found: ${cycles.map((cycle) => cycle.path.join(" → ")).join("; ")}`,
		);
	}
};

export const run = (options: Options = {}) => {
	const { bus, graph } = createDebugBus(options);
	bus.on("checkout/started", (_round, ctx) => {
		ctx.emit("checkout/paid", 1);
	});
	bus.on("checkout/paid", () => {});

	bus.emit("checkout/started", 0);

	let verdict = "passed";
	try {
		assertNoCycles(graph);
	} catch (error) {
		verdict = String(error);
	}

	return resultOf(graph, [`assertNoCycles ${verdict}`]);
};

runIfMain(import.meta, "assert there are no cycles", run);
