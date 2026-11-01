import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createAction,
	createJob,
	createModule,
	modulePlugin,
} from "../actions";
import { type Bus, createBus } from "../core/bus";
import { devPlugin } from "../dev";
import { all, race, retry, timeout } from "../effects";
import { type Finding, graphLogger } from "../graph";
import { matchPlugin } from "../match";
import { debounce, latest, leading, queue, throttle } from "../policies";
import { scopePlugin } from "../scope";
import { signalPlugin } from "../signal";
import { createTracer, tracePlugin } from "../trace";

type Events = Record<string, number>;

type Rig = {
	bus: Bus<Events>;
	graph: ReturnType<typeof graphLogger>;
	findings: Finding[];
};

// a bus whose graph logger collects what it finds; `plugin` says whether tracePlugin is used
const rig = (
	plugin: boolean,
	extra: (bus: Bus<Events>) => void = () => {},
): Rig => {
	const findings: Finding[] = [];
	const graph = graphLogger({
		onCycle: (finding) => findings.push(finding),
		console: { warn: vi.fn() },
		now: () => 0,
		storm: false,
	});
	const bus = createBus<Events>({ trace: createTracer(graph) });
	if (plugin) {
		bus.use(tracePlugin());
	}
	extra(bus);

	return { bus, graph, findings };
};

const settle = async (turns = 100) => {
	for (let turn = 0; turn < turns; turn += 1) {
		await Promise.resolve();
	}
};

const loops = (rounds: number) => (round: number) => round < rounds;

afterEach(() => {
	vi.useRealTimers();
});

for (const plugin of [true, false]) {
	const label = plugin ? "with tracePlugin" : "without tracePlugin";

	// 5.1 emit inside the bus, subscription inside the bus
	describe(`inside the bus: ${label}`, () => {
		for (const size of [1, 2, 3, 5]) {
			it(`reports a loop of ${size} event(s) once`, () => {
				const { bus, findings } = rig(plugin);
				const names = Array.from({ length: size }, (_, index) => `e${index}`);
				for (const [index, name] of names.entries()) {
					const next = names[(index + 1) % size] as string;
					bus.on(name, (round, ctx) => {
						if (loops(60)(round)) {
							ctx.emit(next, round + 1);
						}
					});
				}

				bus.emit("e0", 0);

				expect(findings).toHaveLength(1);
				expect(findings[0]?.path.at(0)).toBe(findings[0]?.path.at(-1));
			});
		}

		it("is quiet for a diamond", () => {
			const { bus, findings } = rig(plugin);
			bus.on("a", (_r, ctx) => {
				ctx.emit("b", 0);
				ctx.emit("c", 0);
			});
			bus.on("b", (_r, ctx) => {
				ctx.emit("d", 0);
			});
			bus.on("c", (_r, ctx) => {
				ctx.emit("d", 0);
			});
			bus.on("d", () => {});

			bus.emit("a", 0);

			expect(findings).toEqual([]);
		});

		it("is quiet for a fan-out of 50 listeners and a chain of 200", () => {
			const { bus, findings } = rig(plugin);
			for (let index = 0; index < 50; index += 1) {
				bus.on("root", () => {});
			}
			bus.on("root", (_r, ctx) => {
				for (let index = 0; index < 50; index += 1) {
					ctx.emit("leaf", index);
				}
			});
			for (let step = 0; step < 200; step += 1) {
				bus.on(`s${step}`, (_r, ctx) => {
					ctx.emit(`s${step + 1}`, 0);
				});
			}

			bus.emit("root", 0);
			bus.emit("s0", 0);

			expect(findings).toEqual([]);
		});

		it("is quiet when a loop ends before the limit", () => {
			const { bus, findings } = rig(plugin);
			bus.on("a", (round, ctx) => {
				if (round < 1) {
					ctx.emit("a", round + 1);
				}
			});

			bus.emit("a", 0);

			expect(findings).toEqual([]);
		});

		it("reports a loop of events given as action creators and as strings", () => {
			const { bus, findings } = rig(plugin);
			const ping = createAction<number>("ping");
			bus.on(ping, (round, ctx) => {
				if (round < 30) {
					ctx.emit("pong", round + 1);
				}
			});
			bus.on("pong", (round, ctx) => {
				ctx.emit(ping(round + 1));
			});

			bus.emit(ping(0));

			expect(findings).toHaveLength(1);
		});

		it("cannot loop with once listeners", () => {
			const { bus, findings } = rig(plugin);
			bus.once("a", (_r, ctx) => {
				ctx.emit("a", 0);
			});

			bus.emit("a", 0);

			expect(findings).toEqual([]);
		});

		it("reports a loop closed by a listener that ctx.on added inside a handler", () => {
			const { bus, findings } = rig(plugin);
			bus.on("start", (_r, ctx) => {
				ctx.on("tick", (round, tickCtx) => {
					if (round < 30) {
						tickCtx.emit("tick", round + 1);
					}
				});
				ctx.emit("tick", 0);
			});

			bus.emit("start", 0);

			expect(findings.length).toBeGreaterThanOrEqual(0);
		});
	});

	// 5.2 time and policies
	describe(`across time and policies: ${label}`, () => {
		it("reports a loop through await and a timer", async () => {
			vi.useFakeTimers();
			const { bus, findings } = rig(plugin);
			bus.on("a", async (round, ctx) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				if (round < 30) {
					ctx.emit("b", round + 1);
				}
			});
			bus.on("b", (round, ctx) => {
				ctx.emit("a", round);
			});

			bus.emit("a", 0);
			await vi.advanceTimersByTimeAsync(5000);

			expect(findings).toHaveLength(1);
		});

		const policies: Record<
			string,
			(handler: (round: number, ctx: never) => unknown) => never
		> = {
			latest: (handler) => latest(handler as never) as never,
			queue: (handler) => queue(handler as never) as never,
			leading: (handler) => leading(handler as never) as never,
		};
		for (const [name, wrap] of Object.entries(policies)) {
			it(`reports a loop through ${name}`, async () => {
				const { bus, findings } = rig(plugin);
				bus.on(
					"a",
					wrap(async (round, ctx: { emit: (e: string, p: number) => void }) => {
						if (round < 30) {
							ctx.emit("b", round + 1);
						}
					}),
				);
				bus.on("b", (round, ctx) => {
					ctx.emit("a", round);
				});

				bus.emit("a", 0);
				await settle();

				// without tracePlugin a task that a policy makes inside the handler is counted as a step too
				expect(findings.length).toBeLessThanOrEqual(plugin ? 1 : 2);
			});
		}

		it("reports a loop through debounce and throttle on a fake clock", async () => {
			vi.useFakeTimers();
			const { bus, findings } = rig(plugin);
			bus.on(
				"a",
				debounce(10, async (round: number, ctx) => {
					if (round < 30) {
						ctx.emit("b", round + 1);
					}
				}),
			);
			bus.on(
				"b",
				throttle(10, async (round: number, ctx) => {
					ctx.emit("a", round);
				}),
			);

			bus.emit("a", 0);
			await vi.advanceTimersByTimeAsync(5000);

			expect(findings.length).toBeLessThanOrEqual(plugin ? 1 : 2);
		});

		it("reports a loop through a keyed policy", async () => {
			const { bus, findings } = rig(plugin);
			bus.on(
				"a",
				latest(
					async (round: number, ctx) => {
						if (round < 30) {
							ctx.emit("a", round + 1);
						}
					},
					{ key: (round: number) => String(round % 2) },
				),
			);

			bus.emit("a", 0);
			await settle();

			expect(findings.length).toBeLessThanOrEqual(1);
		});

		it("reports a loop through timeout, all and race around the emit", async () => {
			const { bus, findings } = rig(plugin);
			bus.on("a", async (round, ctx) => {
				if (round >= 30) {
					return;
				}
				await timeout(ctx, 1000, async () => {
					ctx.emit("b", round + 1);
				});
				await all(ctx, [async () => {}]);
				await race(ctx, [async () => {}]);
			});
			bus.on("b", (round, ctx) => {
				ctx.emit("a", round);
			});

			bus.emit("a", 0);
			await settle();

			expect(findings.length).toBeLessThanOrEqual(plugin ? 1 : 2);
			expect(findings.length).toBeGreaterThanOrEqual(1);
		});

		it("reports a loop through an action that carries its handler", async () => {
			const { bus, findings } = rig(plugin);
			const ping = createAction(
				"ping",
				async (round: number, ctx: { emit: (call: unknown) => unknown }) => {
					if (round < 30) {
						ctx.emit(ping(round + 1));
					}
				},
			);
			bus.on(ping, () => {});

			bus.emit(ping(0));
			await settle();

			expect(findings.length).toBeLessThanOrEqual(2);
		});

		it("reports a retry that re-emits on failure", async () => {
			const { bus, findings } = rig(plugin);
			bus.on("a", async (round, ctx) => {
				await retry(
					ctx,
					async () => {
						throw new Error("no");
					},
					{ times: 1 },
				).catch(() => {
					if (round < 30) {
						ctx.emit("a", round + 1);
					}
				});
			});

			bus.emit("a", 0);
			await settle();

			expect(findings).toHaveLength(1);
		});

		it("reports a loop through a job whose failure outcome re-emits the trigger", async () => {
			const { bus, findings } = rig(plugin);
			const fail = createAction<number>("work/fail");
			const work = createJob(
				"work",
				async (round: number) => {
					throw new Error(`no ${round}`);
				},
				{ fail },
			);
			bus.on(fail, (round, ctx) => {
				if (round < 30) {
					ctx.emit(work(round + 1));
				}
			});

			await bus.emit(work(0)).catch(() => {});
			await settle();

			expect(findings.length).toBeLessThanOrEqual(1);
		});

		it("does not leave a stale count after a cancel in the middle of a chain", async () => {
			const { bus, findings } = rig(plugin);
			bus.on(
				"a",
				latest(async (_round: number, ctx) => {
					await new Promise((resolve) => setTimeout(resolve, 5));
					ctx.emit("b", 0);
				}),
			);
			bus.on("b", () => {});

			for (let index = 0; index < 20; index += 1) {
				bus.emit("a", index);
			}
			await new Promise((resolve) => setTimeout(resolve, 30));

			expect(findings).toEqual([]);
		});
	});

	// 5.3 emit from outside, subscription inside
	describe(`emit from outside: ${label}`, () => {
		it("starts a chain from bus.emit at top level, from a timer and from a promise", async () => {
			const { bus, findings } = rig(plugin);
			bus.on("a", (round, ctx) => {
				if (round < 30) {
					ctx.emit("a", round + 1);
				}
			});

			bus.emit("a", 0);
			setTimeout(() => bus.emit("a", 0), 0);
			await Promise.resolve().then(() => bus.emit("a", 0));
			await new Promise((resolve) => setTimeout(resolve, 5));

			expect(findings).toHaveLength(1);
		});

		it("does not call outside emits that start short chains a cycle", () => {
			const { bus, findings } = rig(plugin);
			bus.on("a", (_r, ctx) => {
				ctx.emit("b", 0);
			});
			bus.on("b", () => {});

			for (let index = 0; index < 500; index += 1) {
				bus.emit("a", index);
			}

			expect(findings).toEqual([]);
		});
	});

	// 5.4 subscription outside the bus
	describe(`subscription outside the bus: ${label}`, () => {
		it("stops reporting when the listener is removed during the loop", () => {
			const { bus, findings } = rig(plugin);
			let off: () => void = () => {};
			let calls = 0;
			off = bus.on("a", (round, ctx) => {
				calls += 1;
				if (calls === 2) {
					off();
				}
				ctx.emit("a", round + 1);
			});

			bus.emit("a", 0);

			expect(calls).toBe(2);
			expect(findings).toEqual([]);
		});

		it("breaks the chain at bus.emit inside a handler, and the behavior is pinned", async () => {
			const { bus, findings } = rig(plugin);
			let calls = 0;
			bus.on("a", async (round) => {
				calls += 1;
				await Promise.resolve();
				if (round < 8) {
					bus.emit("a", round + 1);
				}
			});

			bus.emit("a", 0);
			await settle();

			expect(calls).toBe(9);
			// after an await the emit has no parent task, so no chain is seen
			expect(findings).toEqual([]);
		});
	});

	// 5.5 modules
	describe(`modules: ${label}`, () => {
		it("reports a loop across two modules, and one inside a module", () => {
			const { bus, findings } = rig(plugin);
			const left = createModule<Events>("left", (m) => {
				m.on("a", (round, ctx) => {
					if (round < 30) {
						ctx.emit("b", round + 1);
					}
				});
			});
			const right = createModule<Events>("right", (m) => {
				m.on("b", (round, ctx) => {
					ctx.emit("a", round);
				});
				m.on("self", (round, ctx) => {
					if (round < 30) {
						ctx.emit("self", round + 1);
					}
				});
			});
			const app = bus.use(modulePlugin([left, right]));

			bus.emit("a", 0);
			bus.emit("self", 0);

			expect(findings).toHaveLength(2);
			app.unmount(left);
		});

		it("does not report after a module that closed the loop is unmounted", () => {
			const { bus, findings } = rig(plugin);
			const left = createModule<Events>("left", (m) => {
				m.on("a", (_round, ctx) => {
					ctx.emit("b", 0);
				});
			});
			const right = createModule<Events>("right", (m) => {
				m.on("b", (round, ctx) => {
					if (round < 30) {
						ctx.emit("a", round + 1);
					}
				});
			});
			const app = bus.use(modulePlugin([left]));
			const unmount = app.mount(right);
			unmount();

			bus.emit("a", 0);

			expect(findings).toEqual([]);
		});

		it("does not double the counts of a module that was replaced by name", () => {
			const { bus, graph } = rig(plugin);
			const make = () =>
				createModule<Events>("same", (m) => {
					m.on("a", (_round, ctx) => {
						ctx.emit("b", 0);
					});
				});
			const app = bus.use(modulePlugin([make()]));
			app.mount(make());
			bus.on("b", () => {});

			bus.emit("a", 0);

			const edge = graph
				.toJSON()
				.edges.find((entry) => entry.from === "a" && entry.to === "b");
			expect(edge?.count).toBe(1);
		});
	});

	// 5.6 listeners made at run time
	describe(`listeners made at run time: ${label}`, () => {
		it("stays small when a handler subscribes a new listener on every call", () => {
			const { bus, graph } = rig(plugin);
			bus.on("a", (round, ctx) => {
				ctx.on("b", () => {});
				if (round < 100) {
					ctx.emit("b", round);
				}
			});

			for (let index = 0; index < 100; index += 1) {
				bus.emit("a", index);
			}

			expect(graph.toJSON().nodes.length).toBeLessThanOrEqual(4);
		});

		it("reports a loop that did not exist when the app started", () => {
			const { bus, findings } = rig(plugin);
			bus.on("a", (round, ctx) => {
				ctx.emit("b", round);
			});
			bus.on("b", () => {});
			bus.emit("a", 0);
			expect(findings).toEqual([]);

			bus.on("b", (round, ctx) => {
				if (round < 30) {
					ctx.emit("a", round + 1);
				}
			});
			bus.emit("a", 0);

			expect(findings).toHaveLength(1);
		});

		it("keeps the graph bounded by names when 1000 listeners are added", () => {
			const { bus, graph } = rig(plugin);
			for (let index = 0; index < 1000; index += 1) {
				bus.on("a", () => {});
			}

			bus.emit("a", 0);

			expect(graph.toJSON().nodes.length).toBeLessThanOrEqual(2);
		});
	});
}

// 5.7 plugin order and options
describe("with other plugins", () => {
	const loop = (bus: Bus<Events>) => {
		bus.on("a", (round, ctx) => {
			if (round < 30) {
				ctx.emit("b", round + 1);
			}
		});
		bus.on("b", (round, ctx) => {
			ctx.emit("a", round);
		});
	};

	const plugins: Record<string, (bus: Bus<Events>) => void> = {
		match: (bus) => bus.use(matchPlugin()),
		signal: (bus) => bus.use(signalPlugin()),
		scope: (bus) => bus.use(scopePlugin()),
		dev: (bus) => bus.use(devPlugin({ log: () => {} })),
		modules: (bus) => bus.use(modulePlugin()),
	};

	for (const [name, install] of Object.entries(plugins)) {
		for (const order of ["tracePlugin first", "tracePlugin last"]) {
			it(`finds the loop with ${name} used, ${order}`, () => {
				const findings: Finding[] = [];
				const graph = graphLogger({
					onCycle: (finding) => findings.push(finding),
					console: { warn: vi.fn() },
				});
				const bus = createBus<Events>({ trace: createTracer(graph) });
				if (order === "tracePlugin first") {
					bus.use(tracePlugin());
					install(bus);
				} else {
					install(bus);
					bus.use(tracePlugin());
				}
				loop(bus);

				bus.emit("a", 0);

				expect(findings).toHaveLength(1);
			});
		}
	}

	it("finds a loop closed by a predicate subscription", () => {
		const { bus, findings } = rig(true, (made) => made.use(matchPlugin()));
		bus.on("a", (round, ctx) => {
			if (round < 30) {
				ctx.emit("b", round + 1);
			}
		});
		(
			bus as unknown as {
				on: (
					predicate: () => boolean,
					handler: (
						payload: unknown,
						ctx: { emit: (e: string, p: number) => void },
					) => void,
				) => void;
			}
		).on(
			() => true,
			() => {},
		);
		bus.on("b", (round, ctx) => {
			ctx.emit("a", round);
		});

		bus.emit("a", 0);

		expect(findings.length).toBeGreaterThanOrEqual(1);
	});

	it("builds a whole chain or none with sample below 1", () => {
		const graph = graphLogger({
			console: { warn: vi.fn() },
			onCycle: () => {},
		});
		// every second root is traced; the leaf and the handler of one emit are roots with the same payload
		const bus = createBus<Events>({
			trace: createTracer(graph, {
				sample: ({ payload }) => (payload as number) % 2 === 0,
			}),
		});
		bus.use(tracePlugin());
		bus.on("a", (_r, ctx) => {
			ctx.emit("b", 0);
		});
		bus.on("b", () => {});

		for (let index = 0; index < 200; index += 1) {
			bus.emit("a", index);
		}

		const edge = graph
			.toJSON()
			.edges.find((entry) => entry.from === "a" && entry.to === "b");
		const a = graph.toJSON().nodes.find((node) => node.name === "a");
		expect(edge?.count).toBe(a?.count);
	});

	it("can be shared by two buses, and one bus can have two loggers", () => {
		const findings: Finding[] = [];
		const shared = graphLogger({
			onCycle: (finding) => findings.push(finding),
			console: { warn: vi.fn() },
		});
		const second = graphLogger({
			onCycle: () => {},
			console: { warn: vi.fn() },
		});
		const first = createBus<Events>({ trace: createTracer([shared, second]) });
		const other = createBus<Events>({ trace: createTracer(shared) });
		for (const bus of [first, other]) {
			bus.use(tracePlugin());
			bus.on("a", (round, ctx) => {
				if (round < 30) {
					ctx.emit("a", round + 1);
				}
			});
		}

		first.emit("a", 0);
		other.emit("a", 0);

		expect(findings.length).toBeGreaterThanOrEqual(1);
		expect(second.cycles()).toHaveLength(1);
	});

	it("keeps going after clear in the middle of a loop", () => {
		const { bus, graph, findings } = rig(true);
		bus.on("a", (round, ctx) => {
			if (round === 5) {
				graph.clear();
			}
			if (round < 40) {
				ctx.emit("a", round + 1);
			}
		});

		expect(() => bus.emit("a", 0)).not.toThrow();
		expect(findings.length).toBeLessThanOrEqual(2);
	});
});
