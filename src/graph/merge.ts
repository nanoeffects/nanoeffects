import type {
	EdgeSnapshot,
	Finding,
	GraphSnapshot,
	NodeSnapshot,
} from "./types";

const edgeKey = (from: string, to: string) => `${from}\u0000${to}`;

// the same ring found from another node is one cycle: start it at its smallest name
const ringOf = (path: readonly string[]) => {
	const ring = path.slice(0, -1);
	const start = ring.reduce(
		(best, name, index) => (name < (ring[best] ?? name) ? index : best),
		0,
	);

	return [...ring.slice(start), ...ring.slice(0, start)];
};

const findingKey = (finding: Finding) => {
	const names =
		finding.kind === "cycle" ? ringOf(finding.path) : [finding.root];

	return [
		finding.kind,
		finding.source,
		finding.traceGroupId ?? "",
		...names,
	].join("\u0000");
};

const joinNode = (known: NodeSnapshot | undefined, node: NodeSnapshot) => {
	const joined: NodeSnapshot = { name: node.name, count: node.count };
	const site = node.site ?? known?.site;
	if (known) {
		joined.count += known.count;
	}
	if (site !== void 0) {
		joined.site = known?.site ?? site;
	}
	const last = node.last ?? known?.last;
	if (last !== void 0) {
		joined.last = last;
	}

	return joined;
};

/**
 * Joins the graphs of several runs (tests, e2e, a manual session) into one, so a
 * listener or an edge that no single run reached can still be seen by another.
 * Counts add up, nodes and edges are the union, and a cycle found twice is one
 * cycle. The snapshots you pass are not changed.
 *
 * @example
 * ```ts
 * import { mergeGraphs } from "nanoeffects/trace";
 *
 * // each run wrote `graph.toJSON()` to a file
 * const all = mergeGraphs(unitRun, e2eRun);
 * ```
 */
export const mergeGraphs = (...snapshots: GraphSnapshot[]): GraphSnapshot => {
	const nodes = new Map<string, NodeSnapshot>();
	const edges = new Map<string, EdgeSnapshot>();
	const cycles = new Map<string, Finding>();
	let name: string | undefined;

	for (const snapshot of snapshots) {
		name ??= snapshot.name;
		for (const node of snapshot.nodes) {
			nodes.set(node.name, joinNode(nodes.get(node.name), node));
		}
		for (const edge of snapshot.edges) {
			const key = edgeKey(edge.from, edge.to);
			const known = edges.get(key);
			edges.set(key, {
				from: edge.from,
				to: edge.to,
				count: edge.count + (known?.count ?? 0),
				inCycle: edge.inCycle || (known?.inCycle ?? false),
			});
		}
		for (const finding of snapshot.cycles) {
			const key = findingKey(finding);
			const known = cycles.get(key);
			cycles.set(key, {
				...finding,
				path: [...finding.path],
				turns: finding.turns + (known?.turns ?? 0),
				repeats: Math.max(finding.repeats, known?.repeats ?? 0),
			});
		}
	}

	const merged: GraphSnapshot = {
		nodes: [...nodes.values()],
		edges: [...edges.values()],
		cycles: [...cycles.values()],
	};
	if (name !== void 0) {
		merged.name = name;
	}

	return merged;
};
