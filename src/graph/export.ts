import type { ExportOptions, GraphSnapshot } from "./types";

type Grouping = ExportOptions["group"];

const groupOf = (name: string, group: Grouping) => {
	if (group === "prefix") {
		const slash = name.indexOf("/");

		return slash > 0 ? name.slice(0, slash) : void 0;
	}

	return group?.(name);
};

// inside a Mermaid label in double quotes only the quote, the angle brackets and the line breaks matter
const mermaidText = (text: string) =>
	text
		.replaceAll('"', "#quot;")
		.replaceAll("<", "#lt;")
		.replaceAll(">", "#gt;")
		.replaceAll(/\r?\n/g, " ");

const dotText = (text: string) =>
	text
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll(/\r?\n/g, "\\n");

const idsOf = (snapshot: GraphSnapshot) =>
	new Map(snapshot.nodes.map((node, index) => [node.name, `n${index}`]));

const grouped = (snapshot: GraphSnapshot, group: Grouping) => {
	const groups = new Map<string, string[]>();
	for (const { name } of snapshot.nodes) {
		const key = groupOf(name, group);
		if (key !== void 0) {
			groups.set(key, [...(groups.get(key) ?? []), name]);
		}
	}

	return groups;
};

/** The graph as a Mermaid `flowchart`; the edges of a cycle are red and every edge shows its count. */
export const toMermaid = (
	snapshot: GraphSnapshot,
	options: ExportOptions = {},
) => {
	const ids = idsOf(snapshot);
	const lines = ["flowchart LR"];
	const inGroup = new Set<string>();
	for (const [key, names] of grouped(snapshot, options.group)) {
		lines.push(`  subgraph g_${lines.length}["${mermaidText(key)}"]`);
		for (const name of names) {
			inGroup.add(name);
			lines.push(`    ${ids.get(name)}["${mermaidText(name)}"]`);
		}
		lines.push("  end");
	}
	for (const { name } of snapshot.nodes) {
		if (!inGroup.has(name)) {
			lines.push(`  ${ids.get(name)}["${mermaidText(name)}"]`);
		}
	}
	const red: number[] = [];
	for (const [index, edge] of snapshot.edges.entries()) {
		lines.push(
			`  ${ids.get(edge.from)} -->|x${edge.count}| ${ids.get(edge.to)}`,
		);
		if (edge.inCycle) {
			red.push(index);
		}
	}
	if (red.length > 0) {
		lines.push(`  linkStyle ${red.join(",")} stroke:red,stroke-width:2px`);
	}

	return lines.join("\n");
};

/** The graph as a Graphviz `digraph`. */
export const toDot = (snapshot: GraphSnapshot, options: ExportOptions = {}) => {
	const ids = idsOf(snapshot);
	const lines = ["digraph events {"];
	if (snapshot.name !== void 0) {
		lines.push(`  label="${dotText(snapshot.name)}";`);
	}
	const inGroup = new Set<string>();
	for (const [key, names] of grouped(snapshot, options.group)) {
		lines.push(
			`  subgraph "cluster_${dotText(key)}" {`,
			`    label="${dotText(key)}";`,
		);
		for (const name of names) {
			inGroup.add(name);
			lines.push(`    ${ids.get(name)} [label="${dotText(name)}"];`);
		}
		lines.push("  }");
	}
	for (const { name } of snapshot.nodes) {
		if (!inGroup.has(name)) {
			lines.push(`  ${ids.get(name)} [label="${dotText(name)}"];`);
		}
	}
	for (const edge of snapshot.edges) {
		const style = edge.inCycle ? ", color=red, penwidth=2" : "";
		lines.push(
			`  ${ids.get(edge.from)} -> ${ids.get(edge.to)} [label="x${edge.count}"${style}];`,
		);
	}
	lines.push("}");

	return lines.join("\n");
};
