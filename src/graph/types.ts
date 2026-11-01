import type { JsonValue } from "./serialize";

/** A loop that the logger found, or an event that is emitted too often. */
export type Finding = {
	/** `cycle`: a node repeats in a chain; `storm`: too many emits from outside any task; `runaway`: one root started too many tasks. */
	kind: "cycle" | "storm" | "runaway";
	/** The names from the first turn of the loop back to it: `a`, `b`, `a`. For a storm, the event. */
	path: string[];
	/** How many times the repeating node was in the chain when it was found. */
	repeats: number;
	/** How many times the loop has gone round since it was found, the first time included. */
	turns: number;
	/** The first node of the chain, or the event of a storm. */
	root: string;
	traceGroupId?: string;
	/** `chain`: it ran as one chain; `graph`: the edges of different runs close it. */
	source: "chain" | "graph";
};

export type GraphLoggerOptions = {
	/** Put before every report line and in the title of the exports. */
	name?: string;
	/** How many times a node may be in one chain before it is a cycle. Default 3. */
	repeats?: number;
	/** How many tasks one root may start before the chain is called runaway. Default 5000. */
	maxSteps?: number;
	/** How many emits of one event from outside any task, in how many ms, make a storm. Default 100 in 1000; `false` turns it off. */
	storm?: false | { count: number; perMs: number };
	/** Names that are not counted as repeats, steps or storms (they stay in the graph). */
	ignore?: readonly string[] | ((name: string) => boolean);
	/** Receives each finding once, in place of `console.warn`. */
	onCycle?: (finding: Finding) => void;
	/** Also send each finding to Redux DevTools as `cycle/detected`. */
	devtools?: boolean;
	/** The clock, in ms. Default `performance.now`. */
	now?: () => number;
	/** Where the default report goes. Default `globalThis.console`. */
	console?: Pick<Console, "warn">;
	/** The Redux DevTools extension. Default `globalThis.__REDUX_DEVTOOLS_EXTENSION__`. */
	extension?: DevtoolsExtension;
};

export type DevtoolsExtension = {
	connect: (options?: { name?: string }) => {
		init: (state: unknown) => void;
		send: (action: unknown, state: unknown) => void;
	};
};

export type NodeSnapshot = {
	name: string;
	count: number;
	/** Where the listener was made, when `devPlugin` is used. */
	site?: string;
	last?: { payload: JsonValue; error?: JsonValue };
};

export type EdgeSnapshot = {
	from: string;
	to: string;
	count: number;
	inCycle: boolean;
};

export type GraphSnapshot = {
	name?: string;
	nodes: NodeSnapshot[];
	edges: EdgeSnapshot[];
	cycles: Finding[];
};

export type ExportOptions = {
	/** Put the nodes in groups: `"prefix"` is the part of the name before the first `/`, or a function of the name. */
	group?: "prefix" | ((name: string) => string | undefined);
};

export type JsonOptions = {
	/** Add the last payload and error of each node, made safe. Default `false`. */
	payload?: boolean;
};
