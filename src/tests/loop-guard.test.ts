import { afterEach, describe, expect, it, vi } from "vitest";
import { createAction, createModule, modulePlugin } from "../actions";
import { createBus } from "../core/bus";
import { retry } from "../effects";
import { type LimitFinding, loopGuardPlugin } from "../guard";
import { latest, queue } from "../policies";

type Events = Record<string, number>;

const guarded = (maxRepeats = 5) => {
	const findings: LimitFinding[] = [];
	const bus = createBus<Events>();
	bus.use(
		loopGuardPlugin({
			maxRepeats,
			report: (finding) => findings.push(finding),
		}),
	);

	return { bus, findings };
};

const settle = async () => {
	for (let turn = 0; turn < 50; turn += 1) {
		await Promise.resolve();
	}
};

afterEach(() => {
	vi.useRealTimers();
});

describe("a loop is cut, whatever it runs through", () => {
	it("through latest", async () => {
		const { bus, findings } = guarded();
		let calls = 0;
		bus.on(
			"a",
			latest(async (_round: number, ctx) => {
				calls += 1;
				ctx.emit("a", 0);
			}),
		);

		bus.emit("a", 0);
		await settle();

		expect(calls).toBeLessThanOrEqual(5);
		expect(findings).toHaveLength(1);
	});

	it("through queue", async () => {
		const { bus, findings } = guarded();
		let calls = 0;
		bus.on(
			"a",
			queue(async (_round: number, ctx) => {
				calls += 1;
				ctx.emit("a", 0);
			}),
		);

		bus.emit("a", 0);
		await settle();

		expect(calls).toBeLessThanOrEqual(5);
		expect(findings).toHaveLength(1);
	});

	it("through retry that re-emits on failure", async () => {
		const { bus, findings } = guarded();
		let calls = 0;
		bus.on("a", async (_round, ctx) => {
			calls += 1;
			await retry(
				ctx,
				async () => {
					throw new Error("fail");
				},
				{ times: 1 },
			).catch(() => {
				ctx.emit("a", 0);
			});
		});

		bus.emit("a", 0);
		await settle();

		expect(calls).toBeLessThanOrEqual(5);
		expect(findings).toHaveLength(1);
	});

	it("through an action whose handler emits itself", async () => {
		const { bus, findings } = guarded();
		let calls = 0;
		const ping = createAction(
			"ping",
			async (_value: number, ctx: { emit: (call: unknown) => unknown }) => {
				calls += 1;
				ctx.emit(ping(0));
			},
		);
		bus.on(ping, () => {});

		bus.emit(ping(0));
		await settle();

		expect(calls).toBeLessThanOrEqual(5);
		expect(findings.length).toBeLessThanOrEqual(1);
	});

	it("through two modules", () => {
		const { bus, findings } = guarded();
		let calls = 0;
		const first = createModule<Events>("first", (m) => {
			m.on("a", (_round, ctx) => {
				calls += 1;
				ctx.emit("b", 0);
			});
		});
		const second = createModule<Events>("second", (m) => {
			m.on("b", (_round, ctx) => {
				ctx.emit("a", 0);
			});
		});
		bus.use(modulePlugin([first, second]));

		bus.emit("a", 0);

		expect(calls).toBe(5);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.path).toEqual(["a", "b", "a"]);
	});

	it("from an emit outside any task", () => {
		const { bus, findings } = guarded();
		let calls = 0;
		bus.on("a", (_round, ctx) => {
			calls += 1;
			ctx.emit("a", 0);
		});

		bus.emit("a", 0);
		bus.emit("a", 0);

		// each outside emit starts its own chain, so each is cut at the limit
		expect(calls).toBe(10);
		expect(findings).toHaveLength(1);
	});

	it("through a timer on a fake clock", async () => {
		vi.useFakeTimers();
		const { bus, findings } = guarded();
		let calls = 0;
		bus.on("a", (_round, ctx) => {
			calls += 1;
			setTimeout(() => ctx.emit("b", 0), 10);
		});
		bus.on("b", (_round, ctx) => {
			ctx.emit("a", 0);
		});

		bus.emit("a", 0);
		await vi.advanceTimersByTimeAsync(10_000);

		expect(calls).toBe(5);
		expect(findings).toHaveLength(1);
	});
});

describe("a bus with the guard behaves as without it when nothing loops", () => {
	it("gives the same order and results for a fan-out and a chain", () => {
		const run = (withGuard: boolean) => {
			const bus = createBus<Events>();
			if (withGuard) {
				bus.use(loopGuardPlugin({ report: () => {} }));
			}
			const seen: string[] = [];
			bus.on("a", (round, ctx) => {
				seen.push(`a${round}`);
				ctx.emit("b", round + 1);
				ctx.emit("c", round + 1);
			});
			bus.on("b", (round, ctx) => {
				seen.push(`b${round}`);
				ctx.emit("d", round + 1);
			});
			bus.on("c", (round) => {
				seen.push(`c${round}`);
			});
			bus.on("d", (round) => {
				seen.push(`d${round}`);
			});
			bus.emit("a", 0);

			return seen;
		};

		expect(run(true)).toEqual(run(false));
	});
});
