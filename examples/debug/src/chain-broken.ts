// bus.emit inside a handler, after an await, starts a new chain: the loop is real but no chain shows it.
import { createDebugBus, type Options, resultOf, runIfMain } from "./harness";

export const run = async (options: Options = {}) => {
	const { bus, graph } = createDebugBus(options);
	let calls = 0;

	bus.on("retry", async (round) => {
		calls += 1;
		await Promise.resolve();
		if (round < 8) {
			// bus.emit, not ctx.emit: after the await the emit has no parent task
			bus.emit("retry", round + 1);
		}
	});

	bus.emit("retry", 0);
	for (let turn = 0; turn < 50; turn += 1) {
		await Promise.resolve();
	}

	return resultOf(graph, [
		`the handler ran ${calls} times, and the graph found no cycle`,
		"fix: use ctx.emit so the chain is kept",
	]);
};

runIfMain(import.meta, "bus.emit in a handler breaks the chain", run);
