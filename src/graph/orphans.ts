import type { GraphSnapshot } from "./types";

/**
 * A listener that the graph never saw run. `unemitted`: the graph has no node for
 * the event, so nobody emitted it. `unrun`: the event was emitted, this listener
 * did not run.
 */
export type Orphan = {
	event: string;
	listener: string;
	kind: "unemitted" | "unrun";
};

const anonymous = "<anonymous>";

// `describeBus(bus, { source: true })` adds where the listener was made: " (file:line:column)"
const sourceSuffix = / \([^()]*:\d+:\d+\)$/;

/**
 * Compares the listeners a bus has with the graph of what ran, and lists the
 * listeners the graph never saw. Pass `describeBus(bus)` (with or without `source`) and
 * `graph.toJSON()`, or the result of `mergeGraphs` for wider coverage. A listener
 * is a node of the graph once it has run, by its `traceId` or function name;
 * anonymous listeners have no node and are left out. One run shows many false
 * orphans: read the list as a hint, not as a failure.
 *
 * @example
 * ```ts
 * import { describeBus, findOrphans } from "nanoeffects/trace";
 *
 * const described = describeBus(bus);
 * const orphans = findOrphans(described, graph.toJSON());
 * // [{ event: "cart/cleared", listener: "reset", kind: "unemitted" }]
 * ```
 */
export const findOrphans = (
	described: Readonly<Record<string, readonly string[]>>,
	snapshot: GraphSnapshot,
): Orphan[] => {
	const seen = new Set(snapshot.nodes.map((node) => node.name));
	const orphans: Orphan[] = [];

	for (const [event, listeners] of Object.entries(described)) {
		const emitted = seen.has(event);
		for (const shown of listeners) {
			const listener = shown.replace(sourceSuffix, "");
			if (listener === anonymous || seen.has(listener)) {
				continue;
			}
			orphans.push({
				event,
				listener,
				kind: emitted ? "unrun" : "unemitted",
			});
		}
	}

	return orphans;
};
