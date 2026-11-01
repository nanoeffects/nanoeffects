import { siteOf } from "../core/site";
import type { TaskInfo, TraceEvent, TraceLogger } from "../core/types";
import { findComponents } from "./components";
import { toDot, toMermaid } from "./export";
import { connectDevtools, textOf } from "./report";
import { safeSerialize } from "./serialize";
import type {
	DevtoolsExtension,
	EdgeSnapshot,
	ExportOptions,
	Finding,
	GraphLoggerOptions,
	GraphSnapshot,
	JsonOptions,
} from "./types";

type Root = { name: string; steps: number; flagged: boolean };

// what a task is in a chain: its name, and how often each name was in the chain above it
type Link = {
	node: string;
	event?: string | undefined;
	parent?: Link | undefined;
	counts: Map<string, number>;
	root: Root;
	// a task that a `ctx.run` or a policy made inside a handler is the handler again, not a step
	inner: boolean;
};

export type GraphLogger = TraceLogger & {
	/** The loops found so far: the ones that ran as one chain, and the cycles that the edges of different runs close. */
	cycles: () => Finding[];
	/** The graph as a Mermaid flowchart; the edges of a cycle are red. */
	toMermaid: (options?: ExportOptions) => string;
	/** The graph as a Graphviz digraph. */
	toDot: (options?: ExportOptions) => string;
	/** The graph as plain data that `JSON.stringify` takes. */
	toJSON: (options?: JsonOptions) => GraphSnapshot;
	/** Forgets the graph, the findings and the counters. */
	clear: () => void;
};

const edgeKey = (from: string, to: string) => `${from}\u0000${to}`;

const matcherOf = (ignore: GraphLoggerOptions["ignore"]) => {
	if (typeof ignore === "function") {
		return ignore;
	}
	const names = new Set(ignore);

	return (name: string) => names.has(name);
};

const labelsOf = (link: Link) =>
	link.event === void 0 ? [link.node] : [link.event, link.node];

// the same cycle found from another node of it is one cycle: key it by its smallest name first
const cycleKey = (path: readonly string[]) => {
	const ring = path.slice(0, -1);
	const start = ring.reduce(
		(best, name, index) => (name < (ring[best] ?? name) ? index : best),
		0,
	);

	return [...ring.slice(start), ...ring.slice(0, start)].join("\u0000");
};

// the names from the earlier turn of `node` down to `node` again
const loopPath = (parent: Link | undefined, current: Link) => {
	const { node } = current;
	const between: Link[] = [];
	let up = parent;
	while (up && up.node !== node) {
		between.push(up);
		up = up.parent;
	}

	const inOrder = between.reverse();

	return {
		path: [node, ...inOrder.flatMap(labelsOf), ...labelsOf(current)],
		// the events leave out of the key, so the same ring found from another node is the same key
		names: [node, ...inOrder.map((link) => link.node), node],
	};
};

/**
 * A trace logger that builds the map of which event leads to which, finds loops
 * while the app runs, and writes the map as Mermaid, Graphviz or JSON. Pass it to
 * `createTracer` like any logger; it needs no other setup, and works best with
 * `tracePlugin` (it sees every emit and the names of listeners).
 *
 * @example
 * ```ts
 * const graph = graphLogger({ name: "cart" });
 * const bus = createBus({ trace: createTracer(graph) }).use(tracePlugin());
 *
 * // a loop is written to the console once; read the rest when you want
 * graph.cycles();
 * graph.toMermaid();
 * ```
 */
export const graphLogger = (options: GraphLoggerOptions = {}): GraphLogger => {
	const repeats = options.repeats ?? 3;
	const maxSteps = options.maxSteps ?? 5000;
	const storm =
		options.storm === false
			? void 0
			: (options.storm ?? { count: 100, perMs: 1000 });
	const ignored = matcherOf(options.ignore);
	const now = options.now ?? (() => globalThis.performance.now());
	const out = options.console ?? globalThis.console;

	let nodes = new Map<
		string,
		{ count: number; last?: { payload: unknown; error?: unknown } }
	>();
	let edges = new Map<string, EdgeSnapshot>();
	let findings = new Map<string, Finding>();
	let links = new WeakMap<object, Link>();
	let windows = new Map<string, number[]>();
	let stormed = new Set<string>();
	let sawLeaf = false;
	let warnedPlugin = false;
	// the last emit leaf: the next task with the same parent and type is the handler of that emit
	let lastLeaf: { parent: Link | undefined; type: string } | undefined;
	let sendToDevtools: ((finding: Finding) => void) | undefined;
	let connected = false;
	let reporting = false;

	const addNode = (name: string) => {
		const node = nodes.get(name) ?? { count: 0 };
		node.count += 1;
		nodes.set(name, node);
	};

	const addEdge = (from: string, to: string) => {
		const key = edgeKey(from, to);
		const edge = edges.get(key) ?? { from, to, count: 0, inCycle: false };
		edge.count += 1;
		edges.set(key, edge);
	};

	const sendOut = (finding: Finding) => {
		if (options.devtools && !connected) {
			connected = true;
			const extension =
				options.extension ??
				(globalThis as { __REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension })
					.__REDUX_DEVTOOLS_EXTENSION__;
			sendToDevtools = connectDevtools(
				extension,
				options.name ?? "nanoeffects graph",
			);
		}
		sendToDevtools?.(finding);
		if (options.onCycle) {
			options.onCycle(finding);
		} else {
			out?.warn(textOf(finding, options.name));
		}
	};

	// a finding is told once; a second turn of the same loop only counts
	const found = (key: string, make: () => Finding) => {
		const known = findings.get(key);
		if (known) {
			known.turns += 1;

			return;
		}
		const finding = make();
		findings.set(key, finding);
		// a report that emits on the same bus can start more loops: they are kept, but not reported from inside a report
		if (reporting) {
			return;
		}
		reporting = true;
		try {
			sendOut(finding);
		} catch (error) {
			// the report must never break the task that caused it
			globalThis.console?.error(
				"[nanoeffects] graph logger report failed",
				error,
			);
		} finally {
			reporting = false;
		}
	};

	const countNode = (link: Link, node: string) => {
		const counts = new Map(link.counts);
		counts.set(node, (counts.get(node) ?? 0) + 1);
		link.counts = counts;
	};

	const checkRepeat = (link: Link, info: TaskInfo) => {
		const times = link.counts.get(link.node) ?? 0;
		if (times < repeats || ignored(link.node)) {
			return;
		}
		const { path, names } = loopPath(link.parent, link);
		found(`cycle:${cycleKey(names)}`, () => {
			const finding: Finding = {
				kind: "cycle",
				path,
				repeats: times,
				turns: 1,
				root: link.root.name,
				source: "chain",
			};
			if (info.traceGroupId !== void 0) {
				finding.traceGroupId = info.traceGroupId;
			}

			return finding;
		});
	};

	const checkSteps = (link: Link) => {
		link.root.steps += 1;
		if (link.root.steps <= maxSteps || link.root.flagged) {
			return;
		}
		link.root.flagged = true;
		found(`runaway:${link.root.name}`, () => ({
			kind: "runaway",
			path: [link.root.name],
			repeats: link.root.steps,
			turns: 1,
			root: link.root.name,
			source: "chain",
		}));
	};

	// emits from outside any task: counted by event inside a window of time
	const checkStorm = (type: string) => {
		if (!storm || ignored(type)) {
			return;
		}
		const at = now();
		const recent = (windows.get(type) ?? []).filter(
			(time) => at - time < storm.perMs,
		);
		recent.push(at);
		windows.set(type, recent);
		if (recent.length < storm.count) {
			stormed.delete(type);

			return;
		}
		if (stormed.has(type)) {
			return;
		}
		stormed.add(type);
		found(`storm:${type}:${at}`, () => ({
			kind: "storm",
			path: [type],
			repeats: recent.length,
			turns: 1,
			root: type,
			source: "chain",
		}));
	};

	// the handler of the emit that the last leaf made, as opposed to a task made by `ctx.run` or a policy
	const takesLeaf = (parent: Link | undefined, type: string) => {
		const leaf = lastLeaf;
		if (leaf && leaf.parent === parent && leaf.type === type) {
			lastLeaf = void 0;

			return true;
		}

		return false;
	};

	const makeLink = (
		info: TaskInfo,
		parent: Link | undefined,
		inner: boolean,
	): Link => ({
		node: info.type,
		parent,
		counts: parent?.counts ?? new Map(),
		root: parent?.root ?? { name: info.type, steps: 0, flagged: false },
		inner,
	});

	const warnWithoutPlugin = () => {
		if (warnedPlugin) {
			return;
		}
		warnedPlugin = true;
		queueMicrotask(() => {
			if (!sawLeaf) {
				out?.warn(
					"[nanoeffects] graphLogger got tasks but no emit event: add bus.use(tracePlugin()) for a finer graph.",
				);
			}
		});
	};

	// puts a task in the graph, and checks the chain it ends
	const record = (
		info: TaskInfo,
		link: Link,
		parent: Link | undefined,
		origin: boolean,
	) => {
		countNode(link, info.type);
		// with `tracePlugin` an emit is a leaf and a task, so only the leaf counts as the emit
		if (info.leaf === true || origin || !sawLeaf) {
			addNode(info.type);
			if (parent) {
				addEdge(parent.node, info.type);
			} else {
				checkStorm(info.type);
			}
		}
		// the leaf of an emit that nobody handles is not a turn of any loop, so only handlers are checked
		if (!(info.leaf || ignored(info.type))) {
			checkSteps(link);
			checkRepeat(link, info);
		}
	};

	const create = (info: TaskInfo) => {
		const parent = info.parent ? links.get(info.parent) : void 0;
		if (info.leaf) {
			sawLeaf = true;
			lastLeaf = { parent, type: info.type };
		} else {
			warnWithoutPlugin();
		}
		const unmatched = !info.leaf && sawLeaf && !takesLeaf(parent, info.type);
		// a root task with no emit leaf before it is the root of an emitter (`useEmitter` with a `traceId`), not a `ctx.run` child
		const origin = unmatched && !parent;
		const link = makeLink(info, parent, unmatched && !origin);
		links.set(info.ref, link);
		if (!link.inner) {
			record(info, link, parent, origin);
		}
	};

	// a listener got a name: it is the node now, and the event leads to it
	const rename = (link: Link, info: TaskInfo) => {
		const counts = new Map(link.counts);
		const before = link.node;
		counts.set(before, Math.max(0, (counts.get(before) ?? 1) - 1));
		counts.set(info.type, (counts.get(info.type) ?? 0) + 1);
		link.counts = counts;
		link.node = info.type;
		link.event = info.event;
		addNode(info.type);
		if (info.event !== void 0) {
			addEdge(info.event, info.type);
		}
		if (!link.inner) {
			checkRepeat(link, info);
		}
	};

	const watch = (info: TaskInfo) => {
		const known = links.get(info.ref);
		if (known) {
			rename(known, info);
		} else {
			create(info);
		}
	};

	// the last payload and error of each node, for `toJSON({ payload: true })`
	const logger = (event: TraceEvent) => {
		if (event.phase !== "done" && event.phase !== "error") {
			return;
		}
		const node = nodes.get(event.type);
		if (node) {
			node.last =
				event.phase === "error"
					? { payload: event.payload, error: event.error }
					: { payload: event.payload };
		}
	};

	const snapshot = (): GraphSnapshot => {
		const cycles = allCycles();
		const marked = new Set<string>();
		for (const cycle of cycles) {
			markEdges(cycle, marked);
		}
		const snap: GraphSnapshot = {
			nodes: [...nodes].map(([name, node]) => {
				const site = siteOf(name);

				return site === void 0
					? { name, count: node.count }
					: { name, count: node.count, site };
			}),
			edges: [...edges.values()].map((edge) => ({
				...edge,
				inCycle: marked.has(edgeKey(edge.from, edge.to)),
			})),
			cycles,
		};
		if (options.name !== void 0) {
			snap.name = options.name;
		}

		return snap;
	};

	// every edge between two nodes of a component, or between two steps of a path
	const markEdges = (cycle: Finding, marked: Set<string>) => {
		if (cycle.source === "chain") {
			for (const [index, from] of cycle.path.entries()) {
				const to = cycle.path[index + 1];
				if (to !== void 0) {
					marked.add(edgeKey(from, to));
				}
			}

			return;
		}
		const members = new Set(cycle.path);
		for (const edge of edges.values()) {
			if (members.has(edge.from) && members.has(edge.to)) {
				marked.add(edgeKey(edge.from, edge.to));
			}
		}
	};

	const allCycles = (): Finding[] => {
		const chains = [...findings.values()].filter(
			(finding) => finding.kind === "cycle",
		);
		const covered = new Set(chains.flatMap((finding) => finding.path));
		const graphCycles: Finding[] = [];
		// a name in `ignore` is a recursion on purpose, so its edges do not make a cycle either
		const counted = [...edges.values()].filter(
			(edge) => !(ignored(edge.from) || ignored(edge.to)),
		);
		for (const component of findComponents(counted)) {
			if (component.every((name) => covered.has(name))) {
				continue;
			}
			graphCycles.push({
				kind: "cycle",
				path: component,
				repeats: component.length,
				turns: 0,
				root: component[0] ?? "",
				source: "graph",
			});
		}

		return [
			...findings.values(),
			...graphCycles.filter(
				(cycle) =>
					!chains.some((chain) => chain.path.join() === cycle.path.join()),
			),
		];
	};

	const jsonOf = (jsonOptions: JsonOptions = {}): GraphSnapshot => {
		const snap = snapshot();
		if (!jsonOptions.payload) {
			return snap;
		}
		for (const node of snap.nodes) {
			const last = nodes.get(node.name)?.last;
			if (last) {
				node.last = {
					payload: safeSerialize(last.payload),
					...(last.error !== void 0 && { error: safeSerialize(last.error) }),
				};
			}
		}

		return snap;
	};

	return Object.assign(logger, {
		task: watch,
		cycles: () => allCycles(),
		toMermaid: (exportOptions?: ExportOptions) =>
			toMermaid(snapshot(), exportOptions),
		toDot: (exportOptions?: ExportOptions) => toDot(snapshot(), exportOptions),
		toJSON: jsonOf,
		clear: () => {
			nodes = new Map();
			edges = new Map();
			findings = new Map();
			links = new WeakMap();
			windows = new Map();
			stormed = new Set();
			lastLeaf = void 0;
		},
	});
};
