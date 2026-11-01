import { afterEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import {
	type LimitFinding,
	LoopError,
	type LoopGuardOptions,
	loopGuardPlugin,
} from "./plugin";

type Events = Record<string, number>;

const setup = (options: LoopGuardOptions = {}) => {
	const findings: LimitFinding[] = [];
	const bus = createBus<Events>();
	bus.use(
		loopGuardPlugin({
			report: (finding) => findings.push(finding),
			...options,
		}),
	);

	return { bus, findings };
};

afterEach(() => {
	vi.useRealTimers();
});

describe("loopGuardPlugin: an opt-in plugin", () => {
	it("returns the same bus", () => {
		const bus = createBus<Events>();

		expect(bus.use(loopGuardPlugin())).toBe(bus);
	});

	it("changes nothing for a chain under every limit", () => {
		const { bus, findings } = setup();
		const seen: string[] = [];
		bus.on("a", (round, ctx) => {
			seen.push(`a${round}`);
			ctx.emit("b", round + 1);
		});
		bus.on("b", (round) => {
			seen.push(`b${round}`);
		});

		bus.emit("a", 0);

		expect(seen).toEqual(["a0", "b1"]);
		expect(findings).toEqual([]);
	});

	it("works with no tracer", () => {
		const { bus } = setup({ maxRepeats: 5 });
		let calls = 0;
		bus.on("a", (_round, ctx) => {
			calls += 1;
			ctx.emit("a", 0);
		});

		bus.emit("a", 0);

		expect(calls).toBe(5);
	});
});

describe("loopGuardPlugin: repeats", () => {
	it("cuts a synchronous loop after maxRepeats runs, with no RangeError", () => {
		const { bus, findings } = setup({ maxRepeats: 50 });
		let calls = 0;
		bus.on("a", (_round, ctx) => {
			calls += 1;
			ctx.emit("b", 0);
		});
		bus.on("b", (_round, ctx) => {
			ctx.emit("a", 0);
		});

		expect(() => bus.emit("a", 0)).not.toThrow();
		expect(calls).toBe(50);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.limit).toBe("repeats");
		expect(findings[0]?.path).toEqual(["a", "b", "a"]);
	});

	it("cuts a loop made of microtasks that would never let the page draw", async () => {
		const { bus, findings } = setup({ maxRepeats: 50 });
		let calls = 0;
		bus.on("a", async (_round, ctx) => {
			calls += 1;
			await Promise.resolve();
			ctx.emit("a", 0);
		});

		bus.emit("a", 0);
		for (let turn = 0; turn < 200; turn += 1) {
			await Promise.resolve();
		}

		expect(calls).toBe(50);
		expect(findings).toHaveLength(1);
	});

	it("cuts a loop across timers", async () => {
		vi.useFakeTimers();
		const { bus, findings } = setup({ maxRepeats: 10 });
		let calls = 0;
		bus.on("a", (_round, ctx) => {
			calls += 1;
			setTimeout(() => ctx.emit("a", 0), 0);
		});

		bus.emit("a", 0);
		await vi.advanceTimersByTimeAsync(1000);

		expect(calls).toBe(10);
		expect(findings).toHaveLength(1);
	});

	it("lets a legitimate chain repeat an event below the limit", () => {
		const { bus, findings } = setup({ maxRepeats: 50 });
		let calls = 0;
		bus.on("a", (round, ctx) => {
			calls += 1;
			if (round < 10) {
				ctx.emit("a", round + 1);
			}
		});

		bus.emit("a", 0);

		expect(calls).toBe(11);
		expect(findings).toEqual([]);
	});

	it("does not count a task that ctx.run made as a step", async () => {
		const { bus, findings } = setup({ maxRepeats: 3 });
		bus.on("a", async (_round, ctx) => {
			await ctx.run(async () => {});
			await ctx.run(async () => {});
			await ctx.run(async () => {});
			await ctx.run(async () => {});
		});

		bus.emit("a", 0);
		await Promise.resolve();

		expect(findings).toEqual([]);
	});

	it("leaves the names in ignore out of the repeat count", () => {
		const { bus, findings } = setup({ maxRepeats: 3, ignore: ["tree/visit"] });
		let calls = 0;
		bus.on("tree/visit", (depth, ctx) => {
			calls += 1;
			if (depth < 200) {
				ctx.emit("tree/visit", depth + 1);
			}
		});

		bus.emit("tree/visit", 0);

		expect(calls).toBe(201);
		expect(findings).toEqual([]);
	});
});

describe("loopGuardPlugin: depth", () => {
	it("cuts a chain of generated names at maxDepth", () => {
		const { bus, findings } = setup({ maxDepth: 100 });
		for (let step = 0; step < 300; step += 1) {
			bus.on(`step/${step}`, (_round, ctx) => {
				ctx.emit(`step/${step + 1}`, 0);
			});
		}
		let reached = 0;
		bus.on("step/150", () => {
			reached += 1;
		});

		bus.emit("step/0", 0);

		expect(findings.map((finding) => finding.limit)).toEqual(["depth"]);
		expect(reached).toBe(0);
	});

	it("lets a legitimate chain of 300 different events run to the end", () => {
		const { bus, findings } = setup();
		let last = 0;
		for (let step = 0; step < 300; step += 1) {
			bus.on(`step/${step}`, (_round, ctx) => {
				ctx.emit(`step/${step + 1}`, 0);
			});
		}
		bus.on("step/300", () => {
			last += 1;
		});

		bus.emit("step/0", 0);

		expect(last).toBe(1);
		expect(findings).toEqual([]);
	});
});

describe("loopGuardPlugin: at the limit", () => {
	it("drops the emit by default and reports once for a path", () => {
		const { bus, findings } = setup({ maxRepeats: 3 });
		bus.on("a", (_round, ctx) => {
			ctx.emit("a", 0);
			ctx.emit("a", 0);
		});

		bus.emit("a", 0);

		expect(findings).toHaveLength(1);
	});

	it("throws a LoopError from the refused emit with onLimit: throw", () => {
		const { bus } = setup({ maxRepeats: 3, onLimit: "throw" });
		bus.on("a", (_round, ctx) => {
			ctx.emit("a", 0);
		});

		let thrown: unknown;
		try {
			bus.emit("a", 0);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(LoopError);
		expect((thrown as LoopError).path).toEqual(["a", "a"]);
		expect((thrown as LoopError).limit).toBe("repeats");
	});

	it("goes to console.error when no report is given", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const bus = createBus<Events>();
		bus.use(loopGuardPlugin({ maxRepeats: 3 }));
		bus.on("a", (_round, ctx) => {
			ctx.emit("a", 0);
		});

		bus.emit("a", 0);

		expect(String(error.mock.calls[0]?.[0])).toContain("loop guard");
		error.mockRestore();
	});

	it("does not put the payload in a report", () => {
		const { bus, findings } = setup({ maxRepeats: 3 });
		bus.on("a", (_round, ctx) => {
			ctx.emit("a", 12345);
		});

		bus.emit("a", 12345);

		expect(JSON.stringify(findings)).not.toContain("12345");
	});

	it("does not break the emit when the report throws", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { bus } = setup({
			maxRepeats: 3,
			report: () => {
				throw new Error("report");
			},
		});
		let calls = 0;
		bus.on("a", (_round, ctx) => {
			calls += 1;
			ctx.emit("a", 0);
		});

		expect(() => bus.emit("a", 0)).not.toThrow();
		expect(calls).toBe(3);
	});
});

describe("loopGuardPlugin: only the looping chain is cut", () => {
	it("lets an unrelated chain finish while another is cut", () => {
		const { bus } = setup({ maxRepeats: 3 });
		const done: string[] = [];
		bus.on("loop", (_round, ctx) => {
			ctx.emit("loop", 0);
		});
		bus.on("other", (_round, ctx) => {
			ctx.emit("other/done", 0);
		});
		bus.on("other/done", () => {
			done.push("other");
		});

		bus.emit("loop", 0);
		bus.emit("other", 0);

		expect(done).toEqual(["other"]);
	});

	it("starts a fresh chain with the counts at zero after a cut", () => {
		const { bus } = setup({ maxRepeats: 3 });
		let calls = 0;
		bus.on("a", (round, ctx) => {
			calls += 1;
			if (round === 0) {
				ctx.emit("a", 0);
			}
		});

		bus.emit("a", 0);
		const afterFirst = calls;
		bus.emit("a", 1);

		expect(afterFirst).toBeGreaterThan(0);
		expect(calls).toBe(afterFirst + 1);
	});
});

describe("loopGuardPlugin: maxPerSecond", () => {
	it("refuses emits from outside past the limit in a second, and reports once", () => {
		let time = 0;
		const { bus, findings } = setup({ maxPerSecond: 100, now: () => time });
		let calls = 0;
		bus.on("filters/changed", () => {
			calls += 1;
		});

		for (let index = 0; index < 500; index += 1) {
			time += 1;
			bus.emit("filters/changed", index);
		}

		expect(calls).toBe(100);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.limit).toBe("storm");
	});

	it("starts again in the next second", () => {
		let time = 0;
		const { bus } = setup({ maxPerSecond: 10, now: () => time });
		let calls = 0;
		bus.on("x", () => {
			calls += 1;
		});

		for (const start of [0, 5000]) {
			time = start;
			for (let index = 0; index < 20; index += 1) {
				bus.emit("x", index);
			}
		}

		expect(calls).toBe(20);
	});

	it("is off by default", () => {
		const { bus, findings } = setup();
		let calls = 0;
		bus.on("x", () => {
			calls += 1;
		});

		for (let index = 0; index < 1000; index += 1) {
			bus.emit("x", index);
		}

		expect(calls).toBe(1000);
		expect(findings).toEqual([]);
	});
});

describe("loopGuardPlugin: memory", () => {
	it("keeps no record of finished chains", () => {
		const { bus } = setup();
		bus.on("a", (_round, ctx) => {
			ctx.emit("b", 0);
		});
		bus.on("b", () => {});

		for (let round = 0; round < 100_000; round += 1) {
			bus.emit("a", round);
		}

		// the records are in a WeakMap by task context, so a finished chain is free to go; this checks it still works after many
		let calls = 0;
		bus.on("c", () => {
			calls += 1;
		});
		bus.emit("c", 0);
		expect(calls).toBe(1);
	});
});
