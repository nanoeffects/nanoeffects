// A handler whose result has the name of its trigger (the redux-observable "clear" loop).
import { createDebugBus, type Options, resultOf, runIfMain } from "./harness";

export const run = (options: Options = {}) => {
	const { bus, graph } = createDebugBus(options);

	// clearing a module emits "clear" again, which clears it again
	bus.on("clear", (round, ctx) => {
		if (round < 40) {
			ctx.emit("clear", round + 1);
		}
	});

	bus.emit("clear", 0);

	return resultOf(graph, [
		"look for: the advice line says to emit a different event for the result",
	]);
};

runIfMain(import.meta, "a handler emits its own event", run);
