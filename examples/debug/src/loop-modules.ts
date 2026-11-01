// A loop between two domain modules; the graph groups the events by the part before "/".
import { createModule, modulePlugin } from "nanoeffects/actions";
import {
	createDebugBus,
	type Events,
	type Options,
	resultOf,
	runIfMain,
} from "./harness";

export const run = (options: Options = {}) => {
	const { bus, graph } = createDebugBus(options);

	// the cart module reacts to prices, the pricing module reacts to the cart
	const cart = createModule<Events>("cart", (m) => {
		m.on("price/changed", (round, ctx) => {
			if (round < 40) {
				ctx.emit("cart/changed", round + 1);
			}
		});
	});
	const pricing = createModule<Events>("pricing", (m) => {
		m.on("cart/changed", (round, ctx) => {
			ctx.emit("price/changed", round);
		});
	});
	// modulePlugin — mounts both modules on the bus
	bus.use(modulePlugin([cart, pricing]));

	bus.emit("cart/changed", 0);

	return {
		...resultOf(graph, [
			"look for: the loop crosses the cart and the pricing module",
		]),
		mermaid: graph.toMermaid({ group: "prefix" }),
	};
};

runIfMain(import.meta, "a loop across two modules", run);
