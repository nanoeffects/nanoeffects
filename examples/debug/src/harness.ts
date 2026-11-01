// Shared by the scenarios: one bus with the graph logger, and the way a scenario runs alone.
import { pathToFileURL } from "node:url";
import { createBus } from "nanoeffects";
import {
	createTracer,
	type Finding,
	graphLogger,
	tracePlugin,
} from "nanoeffects/trace";

export type Events = Record<string, number>;

export type Options = {
	// true: the logger writes its own report to the console (a terminal run); false: it stays quiet (a test)
	print?: boolean;
	// the clock of the storm check, so a run gives the same result every time
	now?: () => number;
};

// the bus of a scenario, with tracing on and the graph logger as its logger
export const createDebugBus = (options: Options = {}) => {
	// graphLogger — builds the map of events, finds loops, and writes a report once for each loop
	const graph = graphLogger({
		name: "debug",
		...(options.print ? {} : { onCycle: () => {} }),
		...(options.now && { now: options.now }),
	});
	// createTracer — sends every task of the bus to the logger
	const trace = createTracer(graph);
	// tracePlugin — also reports each emit, so the graph sees events that nothing listens to
	const bus = createBus<Events>({ trace }).use(tracePlugin());

	return { bus, graph };
};

// what every scenario returns, so a test can assert on it and a terminal run can print it
export type Result = {
	findings: Finding[];
	mermaid: string;
	notes: string[];
};

export const resultOf = (
	graph: ReturnType<typeof graphLogger>,
	notes: string[] = [],
): Result => ({
	findings: graph.cycles(),
	mermaid: graph.toMermaid(),
	notes,
});

export const printResult = (title: string, result: Result) => {
	console.log(`\n== ${title}`);
	for (const note of result.notes) {
		console.log(`  ${note}`);
	}
	console.log(`  findings: ${result.findings.length}`);
	for (const finding of result.findings) {
		console.log(`    ${finding.kind}: ${finding.path.join(" → ")}`);
	}
	console.log(`\n${result.mermaid}\n`);
};

// runs `run` when the file is started by `tsx file.ts`, and does nothing when it is imported
export const runIfMain = (
	meta: ImportMeta,
	title: string,
	run: (options: Options) => Result | Promise<Result>,
) => {
	const started = process.argv[1];
	if (started && meta.url === pathToFileURL(started).href) {
		Promise.resolve(run({ print: true })).then((result) =>
			printResult(title, result),
		);
	}
};

// a clock the scenario moves by hand
export const createClock = () => {
	let time = 0;

	return {
		now: () => time,
		advance: (ms: number) => {
			time += ms;
		},
	};
};
