// A cart and a total that update each other: the classic loop between two handlers.
import { createDebugBus, type Options, resultOf, runIfMain } from "./harness";

export const run = (options: Options = {}) => {
	const { bus, graph } = createDebugBus(options);

	// the cart handler recalculates the total, and the total handler writes the cart back
	bus.on("cart/changed", (round, ctx) => {
		// the loop stops at 40 so this scenario ends by itself; a real bug has no such line
		if (round < 40) {
			ctx.emit("total/changed", round + 1);
		}
	});
	bus.on("total/changed", (round, ctx) => {
		ctx.emit("cart/changed", round);
	});

	bus.emit("cart/changed", 0);

	return resultOf(graph, [
		"look for: cart/changed → total/changed → cart/changed",
	]);
};

runIfMain(import.meta, "two handlers feed each other", run);
