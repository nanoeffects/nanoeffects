// A handler that throws in the middle of a chain must not make a later run look like a loop.
import { createDebugBus, type Options, resultOf, runIfMain } from "./harness";

export const run = (options: Options = {}) => {
	const { bus, graph } = createDebugBus(options);
	let failing = true;

	bus.on("a", (_round, ctx) => {
		ctx.emit("b", 0);
	});
	bus.on("b", (_round, ctx) => {
		if (failing) {
			throw new Error("b failed");
		}
		ctx.emit("c", 0);
	});
	bus.on("c", () => {});

	for (let index = 0; index < 20; index += 1) {
		try {
			bus.emit("a", 0);
		} catch {
			// the first handler error is thrown from emit; the scenario goes on
		}
	}
	failing = false;
	for (let index = 0; index < 20; index += 1) {
		bus.emit("a", 0);
	}

	return resultOf(graph, [
		"look for: findings: 0 after 40 runs, half of them failing",
	]);
};

runIfMain(import.meta, "a failing handler in a chain", run);
