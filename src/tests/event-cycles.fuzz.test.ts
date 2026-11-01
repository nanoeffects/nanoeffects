import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { type Finding, graphLogger } from "../graph";
import { findComponents } from "../graph/components";
import { createTracer, tracePlugin } from "../trace";

type Events = Record<string, number>;

// a small deterministic generator, so a failing seed can be replayed
const generator = (seed: number) => {
	let state = seed;

	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
};

const size = 4;
// a cycle of up to `size` nodes is seen twice within `rounds` steps, and 2 successors keep the walk small
const rounds = 9;

// what can be reached from `start`
const reachable = (successors: number[][], start: number) => {
	const seen = new Set<number>([start]);
	const todo = [start];
	while (todo.length > 0) {
		const node = todo.pop() as number;
		for (const next of successors[node] ?? []) {
			if (!seen.has(next)) {
				seen.add(next);
				todo.push(next);
			}
		}
	}

	return seen;
};

describe("random event graphs", () => {
	for (const plugin of [true, false]) {
		it(`reports a cycle exactly when one can be reached (${plugin ? "with" : "without"} tracePlugin)`, () => {
			for (let seed = 1; seed <= 150; seed += 1) {
				const random = generator(seed);
				const successors: number[][] = Array.from({ length: size }, () => {
					const next: number[] = [];
					for (let pick = 0; pick < 2; pick += 1) {
						if (random() < 0.6) {
							next.push(Math.floor(random() * size));
						}
					}

					return next;
				});
				const start = Math.floor(random() * size);
				const findings: Finding[] = [];
				const graph = graphLogger({
					repeats: 2,
					onCycle: (finding) => findings.push(finding),
					console: { warn: vi.fn() },
				});
				const bus = createBus<Events>({ trace: createTracer(graph) });
				if (plugin) {
					bus.use(tracePlugin());
				}
				for (const [node, targets] of successors.entries()) {
					bus.on(`n${node}`, (round, ctx) => {
						if (round < rounds) {
							for (const target of targets) {
								ctx.emit(`n${target}`, round + 1);
							}
						}
					});
				}

				bus.emit(`n${start}`, 0);

				const inReach = reachable(successors, start);
				const edges = [...inReach].flatMap((from) =>
					(successors[from] ?? []).map((to) => ({
						from: `n${from}`,
						to: `n${to}`,
					})),
				);
				const hasCycle = findComponents(edges).length > 0;
				expect(findings.length > 0, `seed ${seed}`).toBe(hasCycle);
				// each reported path is a walk over real edges of the graph
				for (const finding of findings) {
					for (const [index, name] of finding.path.entries()) {
						const next = finding.path[index + 1];
						if (next !== void 0) {
							const from = Number(name.slice(1));
							const to = Number(next.slice(1));
							expect(
								successors[from]?.includes(to),
								`seed ${seed} ${finding.path.join()}`,
							).toBe(true);
						}
					}
				}
			}
		});
	}
});
