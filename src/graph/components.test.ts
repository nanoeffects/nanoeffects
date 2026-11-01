import { describe, expect, it } from "vitest";
import { type Edge, findComponents } from "./components";

const edgesOf = (...pairs: [string, string][]): Edge[] =>
	pairs.map(([from, to]) => ({ from, to }));

const sorted = (components: string[][]) =>
	components.map((component) => [...component].sort()).sort();

describe("findComponents", () => {
	it("finds nothing in a graph with no cycle", () => {
		expect(findComponents(edgesOf(["a", "b"], ["b", "c"], ["a", "c"]))).toEqual(
			[],
		);
	});

	it("finds a node that feeds itself", () => {
		expect(findComponents(edgesOf(["a", "a"]))).toEqual([["a"]]);
	});

	it("finds a cycle seen in pieces", () => {
		expect(sorted(findComponents(edgesOf(["a", "b"], ["b", "a"])))).toEqual([
			["a", "b"],
		]);
	});

	it("finds two separate cycles", () => {
		const found = findComponents(
			edgesOf(
				["a", "b"],
				["b", "a"],
				["c", "d"],
				["d", "e"],
				["e", "c"],
				["a", "c"],
			),
		);

		expect(sorted(found)).toEqual([
			["a", "b"],
			["c", "d", "e"],
		]);
	});

	it("does not call a diamond a cycle", () => {
		expect(
			findComponents(edgesOf(["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"])),
		).toEqual([]);
	});

	it("takes a line of 100 000 nodes with no stack overflow", () => {
		const edges: Edge[] = [];
		for (let index = 0; index < 100_000; index += 1) {
			edges.push({ from: `n${index}`, to: `n${index + 1}` });
		}

		expect(findComponents(edges)).toEqual([]);
	});

	it("takes a ring of 100 000 nodes", () => {
		const edges: Edge[] = [];
		for (let index = 0; index < 100_000; index += 1) {
			edges.push({ from: `n${index}`, to: `n${(index + 1) % 100_000}` });
		}

		const [ring] = findComponents(edges);
		expect(ring).toHaveLength(100_000);
	});

	describe("against a brute-force reference", () => {
		// a node is on a cycle when it reaches itself; two nodes share a component when each reaches the other
		const reference = (edges: Edge[], names: string[]) => {
			const reach = (from: string) => {
				const seen = new Set<string>();
				const todo = [from];
				while (todo.length > 0) {
					const name = todo.pop() as string;
					for (const edge of edges) {
						if (edge.from === name && !seen.has(edge.to)) {
							seen.add(edge.to);
							todo.push(edge.to);
						}
					}
				}

				return seen;
			};
			const reaches = new Map(names.map((name) => [name, reach(name)]));
			const groups = new Map<string, string[]>();
			for (const name of names) {
				if (!reaches.get(name)?.has(name)) {
					continue;
				}
				const key = names
					.filter(
						(other) =>
							reaches.get(name)?.has(other) && reaches.get(other)?.has(name),
					)
					.sort()
					.join();
				groups.set(key, key.split(","));
			}

			return [...groups.values()].sort();
		};

		it("agrees on 200 random small graphs", () => {
			let seed = 7;
			const random = () => {
				seed = (seed * 1664525 + 1013904223) % 4294967296;
				return seed / 4294967296;
			};
			for (let round = 0; round < 200; round += 1) {
				const size = 2 + Math.floor(random() * 7);
				const names = Array.from({ length: size }, (_, index) => `n${index}`);
				const edges: Edge[] = [];
				for (
					let count = Math.floor(random() * size * 2);
					count > 0;
					count -= 1
				) {
					edges.push({
						from: names[Math.floor(random() * size)] as string,
						to: names[Math.floor(random() * size)] as string,
					});
				}

				expect(sorted(findComponents(edges))).toEqual(reference(edges, names));
			}
		});
	});
});
