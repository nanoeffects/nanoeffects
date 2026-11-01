// A walk over a tree that emits the same event for each level: legitimate, so it is left out with ignore.
import { createBus } from "nanoeffects";
import { createTracer, graphLogger, tracePlugin } from "nanoeffects/trace";
import { type Events, type Options, resultOf, runIfMain } from "./harness";

const walk = (ignore: string[], options: Options) => {
	const graph = graphLogger({
		ignore,
		...(options.print ? {} : { onCycle: () => {} }),
	});
	const bus = createBus<Events>({ trace: createTracer(graph) }).use(
		tracePlugin(),
	);
	bus.on("tree/visit", (depth, ctx) => {
		if (depth < 10) {
			ctx.emit("tree/visit", depth + 1);
		}
	});
	bus.emit("tree/visit", 0);

	return graph;
};

export const run = (options: Options = {}) => {
	const reported = walk([], options);
	// ignore — names that the repeat count skips; they stay in the graph
	const ignored = walk(["tree/visit"], options);

	return resultOf(ignored, [
		`without ignore: ${reported.cycles().length} finding(s); with ignore: ${ignored.cycles().length}`,
	]);
};

runIfMain(import.meta, "a legitimate recursion", run);
