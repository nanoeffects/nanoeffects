// A diamond and a fan-out: many edges, no cycle, and the report stays clean.
import { createDebugBus, type Options, resultOf, runIfMain } from "./harness";

export const run = (options: Options = {}) => {
	const { bus, graph } = createDebugBus(options);

	bus.on("order/placed", (_round, ctx) => {
		ctx.emit("stock/reserved", 1);
		ctx.emit("payment/charged", 1);
	});
	bus.on("stock/reserved", (_round, ctx) => {
		ctx.emit("order/ready", 1);
	});
	bus.on("payment/charged", (_round, ctx) => {
		ctx.emit("order/ready", 1);
	});
	bus.on("order/ready", (_round, ctx) => {
		for (let channel = 0; channel < 20; channel += 1) {
			ctx.emit(`notify/${channel}`, 1);
		}
	});

	bus.emit("order/placed", 0);

	return resultOf(graph, [
		"look for: findings: 0 and no red edge in the diagram",
	]);
};

runIfMain(import.meta, "a flow with no cycle", run);
