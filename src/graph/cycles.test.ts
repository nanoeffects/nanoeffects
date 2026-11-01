import { afterEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { createTracer, tracePlugin } from "../trace";
import { graphLogger } from "./logger";
import type { Finding, GraphLoggerOptions } from "./types";

type Events = Record<string, number>;

const setup = (options: GraphLoggerOptions = {}, plugin = true) => {
	const findings: Finding[] = [];
	const graph = graphLogger({
		onCycle: (finding) => findings.push(finding),
		console: { warn: vi.fn() },
		...options,
	});
	const bus = createBus<Events>({ trace: createTracer(graph) });
	if (plugin) {
		bus.use(tracePlugin());
	}

	return { bus, graph, findings };
};

// a loop that ends by itself after `turns` rounds, so a test never hangs
const loopBetween = (
	bus: ReturnType<typeof setup>["bus"],
	first: string,
	second: string,
	turns: number,
) => {
	bus.on(first, (round, ctx) => {
		if (round < turns) {
			ctx.emit(second, round + 1);
		}
	});
	bus.on(second, (round, ctx) => {
		if (round < turns) {
			ctx.emit(first, round + 1);
		}
	});
};

afterEach(() => {
	vi.useRealTimers();
});

for (const plugin of [true, false]) {
	describe(`cycles ${plugin ? "with" : "without"} tracePlugin`, () => {
		it("reports two handlers that feed each other, once, with the path", () => {
			const { bus, findings } = setup({}, plugin);
			loopBetween(bus, "cart/changed", "total/changed", 20);

			bus.emit("cart/changed", 0);

			expect(findings).toHaveLength(1);
			expect(findings[0]?.kind).toBe("cycle");
			expect(findings[0]?.path).toEqual([
				"cart/changed",
				"total/changed",
				"cart/changed",
			]);
		});

		it("reports a handler that emits its own event", () => {
			const { bus, findings } = setup({}, plugin);
			bus.on("x", (round, ctx) => {
				if (round < 20) {
					ctx.emit("x", round + 1);
				}
			});

			bus.emit("x", 0);

			expect(findings).toHaveLength(1);
			expect(findings[0]?.path).toEqual(["x", "x"]);
		});

		it("reports a loop of three", () => {
			const { bus, findings } = setup({}, plugin);
			for (const [from, to] of [
				["a", "b"],
				["b", "c"],
				["c", "a"],
			] as const) {
				bus.on(from, (round, ctx) => {
					if (round < 30) {
						ctx.emit(to, round + 1);
					}
				});
			}

			bus.emit("a", 0);

			expect(findings).toHaveLength(1);
			expect(findings[0]?.path).toEqual(["a", "b", "c", "a"]);
		});

		it("reports a loop across an await and a timer", async () => {
			vi.useFakeTimers();
			const { bus, findings } = setup({}, plugin);
			bus.on("a", async (round, ctx) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (round < 20) {
					ctx.emit("b", round + 1);
				}
			});
			bus.on("b", async (round, ctx) => {
				await Promise.resolve();
				ctx.emit("a", round + 1);
			});

			bus.emit("a", 0);
			await vi.advanceTimersByTimeAsync(5000);

			expect(findings).toHaveLength(1);
			expect(findings[0]?.path).toEqual(["a", "b", "a"]);
		});

		it("does not report a long chain of different events", () => {
			const { bus, findings } = setup({}, plugin);
			for (let step = 0; step < 200; step += 1) {
				bus.on(`step/${step}`, (_round, ctx) => {
					ctx.emit(`step/${step + 1}`, 1);
				});
			}

			bus.emit("step/0", 1);

			expect(findings).toEqual([]);
		});

		it("does not report a repeat below the limit", () => {
			const { bus, findings } = setup({}, plugin);
			loopBetween(bus, "a", "b", 3);

			bus.emit("a", 0);

			expect(findings).toEqual([]);
		});

		it("does not report siblings", () => {
			const { bus, findings } = setup({}, plugin);
			bus.on("a", (_round, ctx) => {
				for (let index = 0; index < 5; index += 1) {
					ctx.emit("b", index);
				}
			});
			bus.on("b", () => {});

			bus.emit("a", 0);

			expect(findings).toEqual([]);
		});

		it("does not stop anything: the handlers run as many times as the loop says", () => {
			const { bus } = setup({}, plugin);
			let calls = 0;
			bus.on("a", (round, ctx) => {
				calls += 1;
				if (round < 50) {
					ctx.emit("a", round + 1);
				}
			});

			bus.emit("a", 0);

			expect(calls).toBe(51);
		});

		it("reports once for a path however long the loop goes, and counts the turns", () => {
			const { bus, graph, findings } = setup({}, plugin);
			loopBetween(bus, "a", "b", 500);

			bus.emit("a", 0);

			expect(findings).toHaveLength(1);
			expect(graph.cycles()[0]?.turns).toBeGreaterThan(100);
		});

		it("reports two different loops separately", () => {
			const { bus, findings } = setup({}, plugin);
			loopBetween(bus, "a", "b", 20);
			loopBetween(bus, "c", "d", 20);

			bus.emit("a", 0);
			bus.emit("c", 0);

			expect(findings.map((finding) => finding.path[0]).sort()).toEqual([
				"a",
				"c",
			]);
		});

		it("takes repeats as an option", () => {
			const { bus, findings } = setup({ repeats: 10 }, plugin);
			loopBetween(bus, "a", "b", 40);

			bus.emit("a", 0);

			expect(findings).toHaveLength(1);
			expect(findings[0]?.repeats).toBe(10);
		});

		it("leaves the names in ignore out of the count, but keeps them in the graph", () => {
			const { bus, graph, findings } = setup(
				{ ignore: ["tree/visit"] },
				plugin,
			);
			bus.on("tree/visit", (depth, ctx) => {
				if (depth < 10) {
					ctx.emit("tree/visit", depth + 1);
				}
			});

			bus.emit("tree/visit", 0);

			expect(findings).toEqual([]);
			expect(graph.toJSON().nodes.map((node) => node.name)).toContain(
				"tree/visit",
			);
		});

		it("does not let a task that ctx.run made count as a step of the loop", async () => {
			const { bus, findings } = setup({}, plugin);
			bus.on("a", async (_round, ctx) => {
				await ctx.run(async () => {});
				await ctx.run(async () => {});
				await ctx.run(async () => {});
			});

			bus.emit("a", 0);
			await Promise.resolve();

			expect(findings).toEqual([]);
		});
	});
}

describe("cycles: names", () => {
	it("follows the names of listeners and puts the event before each", () => {
		const { bus, findings } = setup();
		bus.on(
			"cart/changed",
			(round, ctx) => {
				if (round < 20) {
					ctx.emit("total/changed", round + 1);
				}
			},
			{ traceId: "recalcTotal" },
		);
		bus.on(
			"total/changed",
			(round, ctx) => {
				ctx.emit("cart/changed", round + 1);
			},
			{ traceId: "syncCart" },
		);

		bus.emit("cart/changed", 0);

		expect(findings).toHaveLength(1);
		expect(findings[0]?.path).toEqual([
			"recalcTotal",
			"total/changed",
			"syncCart",
			"cart/changed",
			"recalcTotal",
		]);
	});
});

describe("cycles: the report", () => {
	it("goes to console.warn with the path and a line of advice, when onCycle is not set", () => {
		const warn = vi.fn();
		const graph = graphLogger({ console: { warn }, name: "cart" });
		const bus = createBus<Events>({ trace: createTracer(graph) });
		bus.use(tracePlugin());
		loopBetween(bus, "a", "b", 20);

		bus.emit("a", 0);

		expect(warn).toHaveBeenCalledTimes(1);
		const text = String(warn.mock.calls[0]?.[0]);
		expect(text).toContain("[nanoeffects cart]");
		expect(text).toContain("a → b → a");
		expect(text).toContain("break the loop");
	});

	it("says to emit a different event for a handler that emits its own", () => {
		const warn = vi.fn();
		const graph = graphLogger({ console: { warn } });
		const bus = createBus<Events>({ trace: createTracer(graph) });
		bus.use(tracePlugin());
		bus.on("x", (round, ctx) => {
			if (round < 20) {
				ctx.emit("x", round + 1);
			}
		});

		bus.emit("x", 0);

		expect(String(warn.mock.calls[0]?.[0])).toContain("emit a different event");
	});

	it("does not call the console when onCycle is set", () => {
		const warn = vi.fn();
		const { bus } = setup({ console: { warn } });
		loopBetween(bus, "a", "b", 20);

		bus.emit("a", 0);

		expect(warn).not.toHaveBeenCalled();
	});

	it("does not break the task when onCycle throws", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { bus } = setup({
			onCycle: () => {
				throw new Error("report");
			},
		});
		let calls = 0;
		bus.on("a", (round, ctx) => {
			calls += 1;
			if (round < 10) {
				ctx.emit("a", round + 1);
			}
		});

		expect(() => bus.emit("a", 0)).not.toThrow();
		expect(calls).toBe(11);
	});

	it("sends cycle/detected to Redux DevTools when devtools is on", () => {
		const sent: unknown[] = [];
		const extension = {
			connect: () => ({
				init: () => {},
				send: (action: unknown) => {
					sent.push(action);
				},
			}),
		};
		const { bus } = setup({ devtools: true, extension });
		loopBetween(bus, "a", "b", 20);

		bus.emit("a", 0);

		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			type: "cycle/detected",
			path: ["a", "b", "a"],
		});
	});

	it("is quiet about DevTools when the extension is not installed", () => {
		const { bus, findings } = setup({ devtools: true });
		loopBetween(bus, "a", "b", 20);

		expect(() => bus.emit("a", 0)).not.toThrow();
		expect(findings).toHaveLength(1);
	});

	it("never puts the payload in a report", () => {
		const { bus, findings } = setup();
		bus.on("a", (round, ctx) => {
			if (round < 20) {
				ctx.emit("a", round + 1);
			}
		});

		bus.emit("a", 0);

		expect(JSON.stringify(findings)).not.toContain("payload");
	});
});

describe("storms", () => {
	it("reports 100 emits of one event from outside within a second, once", () => {
		let time = 0;
		const { bus, findings } = setup({ now: () => time });
		bus.on("filters/changed", () => {});

		for (let index = 0; index < 150; index += 1) {
			time += 5;
			bus.emit("filters/changed", index);
		}

		expect(findings).toHaveLength(1);
		expect(findings[0]?.kind).toBe("storm");
		expect(findings[0]?.path).toEqual(["filters/changed"]);
	});

	it("does not report 100 emits over ten seconds", () => {
		let time = 0;
		const { bus, findings } = setup({ now: () => time });
		bus.on("filters/changed", () => {});

		for (let index = 0; index < 100; index += 1) {
			time += 100;
			bus.emit("filters/changed", index);
		}

		expect(findings).toEqual([]);
	});

	it("does not count the emits of handlers", () => {
		const { bus, findings } = setup({ now: () => 0 });
		bus.on("a", (_round, ctx) => {
			for (let index = 0; index < 150; index += 1) {
				ctx.emit("b", index);
			}
		});
		bus.on("b", () => {});

		bus.emit("a", 0);

		expect(findings).toEqual([]);
	});

	it("is off with storm: false", () => {
		const { bus, findings } = setup({ storm: false, now: () => 0 });
		bus.on("x", () => {});

		for (let index = 0; index < 500; index += 1) {
			bus.emit("x", index);
		}

		expect(findings).toEqual([]);
	});

	it("reports again in a later window", () => {
		let time = 0;
		const { bus, findings } = setup({
			now: () => time,
			storm: { count: 10, perMs: 100 },
		});
		bus.on("x", () => {});

		for (const start of [0, 10_000]) {
			time = start;
			for (let index = 0; index < 20; index += 1) {
				time += 1;
				bus.emit("x", index);
			}
		}

		expect(findings).toHaveLength(2);
	});
});

describe("runaway chains", () => {
	it("reports a chain of generated names that never repeats a node", () => {
		const { bus, findings } = setup({ maxSteps: 50 });
		for (let step = 0; step < 100; step += 1) {
			bus.on(`step/${step}`, (_round, ctx) => {
				ctx.emit(`step/${step + 1}`, 1);
			});
		}

		bus.emit("step/0", 1);

		expect(findings.map((finding) => finding.kind)).toEqual(["runaway"]);
	});

	it("does not report a long chain that ends below the limit", () => {
		const { bus, findings } = setup({ maxSteps: 1000 });
		for (let step = 0; step < 400; step += 1) {
			bus.on(`step/${step}`, (_round, ctx) => {
				ctx.emit(`step/${step + 1}`, 1);
			});
		}

		bus.emit("step/0", 1);

		expect(findings).toEqual([]);
	});
});

describe("cycles seen in pieces", () => {
	it("lists the cycle that the edges of different runs close, with no report", () => {
		const { bus, graph, findings } = setup();
		bus.on("a", (_round, ctx) => {
			ctx.emit("b", 1);
		});
		bus.on("b", () => {});
		bus.emit("a", 0);

		const other = createBus<Events>({ trace: createTracer(graph) });
		other.use(tracePlugin());
		other.on("b", (_round, ctx) => {
			ctx.emit("a", 1);
		});
		other.on("a", () => {});
		other.emit("b", 0);

		const [cycle] = graph.cycles();
		expect(cycle?.source).toBe("graph");
		expect([...(cycle?.path ?? [])].sort()).toEqual(["a", "b"]);
		expect(findings).toEqual([]);
	});
});
