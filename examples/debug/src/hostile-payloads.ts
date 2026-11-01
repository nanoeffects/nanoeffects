// Payloads that a plain JSON.stringify cannot take: a class instance, a Map, a cycle, an Error.
import { createBus } from "nanoeffects";
import { createTracer, graphLogger, tracePlugin } from "nanoeffects/trace";
import { type Options, resultOf, runIfMain } from "./harness";

class User {
	name: string;
	constructor(name: string) {
		this.name = name;
	}
}

export const run = (options: Options = {}) => {
	const graph = graphLogger(options.print ? {} : { onCycle: () => {} });
	// this bus takes any payload, because the scenario is about payloads that are not plain data
	const bus = createBus<{ hostile: unknown }>({
		trace: createTracer(graph),
	}).use(tracePlugin());
	bus.on("hostile", () => {});

	const cycle: {
		self?: unknown;
		user: User;
		tags: Map<string, number>;
		failure: Error;
	} = {
		user: new User("Ann"),
		tags: new Map([["a", 1]]),
		failure: new Error("boom", { cause: new TypeError("inner") }),
	};
	cycle.self = cycle;
	bus.emit("hostile", cycle);

	// payload: true — adds the last payload of each node, made safe; the default leaves payloads out
	const withPayload = graph.toJSON({ payload: true });
	const safe = JSON.stringify(
		withPayload.nodes.find((node) => node.name === "hostile")?.last,
	);

	return {
		...resultOf(graph, [`safe payload: ${safe}`]),
		safe,
	};
};

runIfMain(import.meta, "hostile payloads", run);
