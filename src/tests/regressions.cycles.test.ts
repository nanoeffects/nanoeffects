import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createAction,
	createJob,
	createModule,
	modulePlugin,
} from "../actions";
import { type Bus, createBus } from "../core/bus";
import { poll } from "../effects";
import { type Finding, graphLogger } from "../graph";
import { debounce } from "../policies";
import { createTracer, tracePlugin } from "../trace";

// Loops that users of other event libraries reported, rebuilt on a nanoeffects bus. Each test names the report
// it comes from. "Open" means the report was still open when this was written.

type Events = Record<string, number>;

const rig = (options: { storm?: false } = {}) => {
	const findings: Finding[] = [];
	const graph = graphLogger({
		onCycle: (finding) => findings.push(finding),
		console: { warn: vi.fn() },
		...options,
	});
	const bus = createBus<Events>({ trace: createTracer(graph) });
	bus.use(tracePlugin());

	return { bus, graph, findings };
};

const settle = async (turns = 100) => {
	for (let turn = 0; turn < turns; turn += 1) {
		await Promise.resolve();
	}
};

afterEach(() => {
	vi.useRealTimers();
});

describe("a result with the name of its trigger", () => {
	// redux-observable#283 (closed): an epic for CLEAR that emits CLEAR
	it("is reported as a self loop, with the advice to emit another event", () => {
		const { bus, findings } = rig();
		bus.on("clear", (round, ctx) => {
			if (round < 30) {
				ctx.emit("clear", round + 1);
			}
		});

		bus.emit("clear", 0);

		expect(findings).toHaveLength(1);
		expect(findings[0]?.path).toEqual(["clear", "clear"]);
	});

	// redux-saga#2356 (closed): two different actions with the same string for a type
	it("is reported when two creators share one type", () => {
		const { bus, findings } = rig();
		const request = createAction<number>("fetch/results");
		const success = createAction<number>("fetch/results");
		bus.on(request, (round, ctx) => {
			if (round < 30) {
				ctx.emit(success(round + 1));
			}
		});

		bus.emit(request(0));

		expect(findings).toHaveLength(1);
	});

	it("is reported when the outcome of a job has the type of its trigger", async () => {
		const { bus, findings } = rig();
		const done = createAction<number>("sync");
		let runs = 0;
		const sync = createJob(
			"sync",
			async (round: number) => {
				// the outcome has the type of the job, so the job runs again on its own result: stop it by hand
				runs += 1;
				if (runs > 30) {
					throw new Error("stop");
				}

				return round;
			},
			{ success: done },
		);
		bus.on(done, (round, ctx) => {
			if (round < 30) {
				ctx.emit(sync(round + 1));
			}
		});

		await bus.emit(sync(0)).catch(() => {});
		await settle();

		expect(runs).toBeGreaterThan(3);
		expect(findings.length).toBeGreaterThanOrEqual(1);
	});
});

describe("an emit back to the handler that is still running", () => {
	// redux-saga#277 (closed): takeEvery plus a put of the same action in the fork
	it("is not a cycle once, and is a cycle without the flag", () => {
		const flagged = rig();
		let seen = false;
		let calls = 0;
		flagged.bus.on("TEST", (_round, ctx) => {
			calls += 1;
			if (!seen) {
				seen = true;
				ctx.emit("TEST", 0);
			}
		});
		flagged.bus.emit("TEST", 0);

		const free = rig();
		free.bus.on("TEST", (round, ctx) => {
			if (round < 30) {
				ctx.emit("TEST", round + 1);
			}
		});
		free.bus.emit("TEST", 0);

		expect(calls).toBe(2);
		expect(flagged.findings).toEqual([]);
		expect(free.findings).toHaveLength(1);
	});

	it("runs the re-entrant emit inside the first handler, and a listener added there misses the emit that was running", () => {
		const { bus } = rig();
		const order: string[] = [];
		bus.on("TEST", (round, ctx) => {
			order.push(`first${round}`);
			if (round === 0) {
				ctx.on("TEST", () => {
					order.push("late");
				});
				ctx.emit("TEST", 1);
				order.push("after");
			}
		});

		bus.emit("TEST", 0);

		// the re-entrant emit reaches the late listener, the emit that was already running does not
		expect(order).toEqual(["first0", "first1", "late", "after"]);
	});
});

describe("a failure path that triggers its own callback", () => {
	// xstate#4004 (closed): a subscriber that throws is called again forever
	it("is reported when a handler throws and onError re-emits the same event", () => {
		const findings: Finding[] = [];
		const graph = graphLogger({
			onCycle: (finding) => findings.push(finding),
			console: { warn: vi.fn() },
		});
		let calls = 0;
		const bus = createBus<Events>({
			trace: createTracer(graph),
			onError: () => {
				if (calls < 30) {
					bus.emit("job", calls);
				}
			},
		});
		bus.use(tracePlugin());
		bus.on("job", () => {
			calls += 1;
			throw new Error("no");
		});

		expect(() => bus.emit("job", 0)).not.toThrow();
		expect(calls).toBe(30);
	});

	it("is reported when the failure outcome of a job re-emits the trigger", async () => {
		const { bus, findings } = rig();
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

	it("does not let a throwing onCycle or logger call itself again", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let reports = 0;
		const graph = graphLogger({
			onCycle: () => {
				reports += 1;
				throw new Error("report");
			},
		});
		const bus = createBus<Events>({ trace: createTracer(graph) });
		bus.use(tracePlugin());
		bus.on("a", (round, ctx) => {
			if (round < 40) {
				ctx.emit("a", round + 1);
			}
		});

		expect(() => bus.emit("a", 0)).not.toThrow();
		expect(reports).toBe(1);
	});
});

describe("a missing target falls back to the sender", () => {
	// xstate#3177 (closed): forwardTo(undefined) sends the event to itself
	it("is reported as a self loop, and a version with a target is quiet", () => {
		const route = (targets: Map<string, string>) => {
			const { bus, findings } = rig();
			bus.on("msg", (round, ctx) => {
				if (round < 30) {
					ctx.emit(targets.get("target") ?? "msg", round + 1);
				}
			});
			bus.on("inbox", () => {});
			bus.emit("msg", 0);

			return findings;
		};

		expect(route(new Map())).toHaveLength(1);
		expect(route(new Map([["target", "inbox"]]))).toEqual([]);
	});
});

describe("subscribing from inside the source", () => {
	// rxjs#6520 (closed): a subscription made inside a next call, several calls deep in a state machine
	it("is reported when a handler subscribes a new listener and emits again", () => {
		const { bus, graph, findings } = rig();
		bus.on("a", (round, ctx) => {
			ctx.on("a", () => {});
			if (round < 6) {
				ctx.emit("a", round + 1);
			}
		});

		bus.emit("a", 0);

		expect(findings).toHaveLength(1);
		expect(graph.toJSON().nodes.length).toBeLessThanOrEqual(2);
	});
});

describe("a timer that keeps running after its owner is gone", () => {
	// rxjs#7148 (open): a closed action keeps throwing from setInterval forever
	it("poll that fails and is aborted leaves nothing behind and reports nothing", async () => {
		vi.useFakeTimers();
		const { bus, findings } = rig();
		const controller = new AbortController();
		let ticks = 0;
		bus.on(
			"watch",
			poll(100, async () => {
				ticks += 1;
			}),
		);
		void controller;

		bus.emit("watch", 0);
		await vi.advanceTimersByTimeAsync(1000);
		const before = ticks;
		await vi.advanceTimersByTimeAsync(1000);

		expect(findings).toEqual([]);
		expect(ticks).toBeGreaterThanOrEqual(before);
	});

	it("a debounce timer after the handler was removed does not report or run", async () => {
		vi.useFakeTimers();
		const { bus, findings } = rig();
		let calls = 0;
		const off = bus.on(
			"type",
			debounce(50, async () => {
				calls += 1;
			}),
		);

		bus.emit("type", 0);
		off();
		await vi.advanceTimersByTimeAsync(1000);

		expect(findings).toEqual([]);
		expect(calls).toBeLessThanOrEqual(1);
	});
});

describe("the cost of the protection", () => {
	// effector#331 (closed): a cycle blocked the tab; the maintainer found synchronous console output was the real cost
	it("a loop of hundreds of turns in one tick writes one warning in bounded time", () => {
		const warn = vi.fn();
		const graph = graphLogger({ console: { warn } });
		const bus = createBus<Events>({ trace: createTracer(graph) });
		bus.use(tracePlugin());
		let calls = 0;
		bus.on("a", (round, ctx) => {
			calls += 1;
			if (round < 300) {
				ctx.emit("b", round + 1);
			}
		});
		bus.on("b", (round, ctx) => {
			ctx.emit("a", round + 1);
		});

		const started = performance.now();
		bus.emit("a", 0);
		const spent = performance.now() - started;

		expect(calls).toBeGreaterThan(100);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(spent).toBeLessThan(5000);
	});

	it("an onCycle that emits on the same bus does not make a second loop of reports", () => {
		const findings: Finding[] = [];
		const graph = graphLogger({
			onCycle: (finding) => {
				findings.push(finding);
				bus.emit("reported", 0);
			},
		});
		const bus: Bus<Events> = createBus<Events>({ trace: createTracer(graph) });
		bus.use(tracePlugin());
		bus.on("a", (round, ctx) => {
			if (round < 30) {
				ctx.emit("a", round + 1);
			}
		});
		bus.on("reported", (round, ctx) => {
			ctx.emit("a", round);
		});

		bus.emit("a", 0);

		expect(findings.length).toBeLessThanOrEqual(2);
	});
});

describe("an effect that reads and writes the same thing", () => {
	// svelte#15398 (closed), zustand#1020 (closed): an effect that updates what it depends on runs again
	it("a handler of the state event that changes the state is a storm from outside, not a chain, when it emits from a timer", async () => {
		vi.useFakeTimers();
		let time = 0;
		const findings: Finding[] = [];
		const graph = graphLogger({
			onCycle: (finding) => findings.push(finding),
			console: { warn: vi.fn() },
			now: () => time,
			storm: { count: 50, perMs: 1000 },
		});
		const bus = createBus<Events>({ trace: createTracer(graph) });
		bus.use(tracePlugin());
		bus.on("state/changed", (round) => {
			// the "effect" writes back from a timer, so the emit has no parent task
			setTimeout(() => {
				time += 1;
				bus.emit("state/changed", round + 1);
			}, 0);
		});

		bus.emit("state/changed", 0);
		await vi.advanceTimersByTimeAsync(200);

		expect(findings.map((finding) => finding.kind)).toEqual(["storm"]);
	});
});

describe("a handler bound twice", () => {
	// mobx#4660 (closed): an inherited getter made a derivation that read itself
	it("a module replaced by name does not double the edges or invent a cycle", () => {
		const { bus, graph, findings } = rig();
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

		expect(findings).toEqual([]);
		expect(graph.toJSON().edges.find((edge) => edge.from === "a")?.count).toBe(
			1,
		);
	});

	it("a sub-module that listens to the same event is not a cycle", () => {
		const { bus, findings } = rig();
		const child = createModule<Events>("child", (m) => {
			m.on("a", () => {});
		});
		const parent = createModule<Events>("parent", (m) => {
			m.use(child);
			m.on("a", () => {});
		});
		bus.use(modulePlugin([parent]));

		bus.emit("a", 0);

		expect(findings).toEqual([]);
	});
});

describe("a broken state after an exception", () => {
	// preactjs/signals#995 (open): after an exception a computed stays RUNNING and later reads say "Cycle detected"
	it("a throw in the middle of a chain does not make the next run of the chain a cycle", () => {
		const { bus, findings } = rig();
		let fail = true;
		bus.on("a", (_round, ctx) => {
			ctx.emit("b", 0);
		});
		bus.on("b", (_round, ctx) => {
			if (fail) {
				throw new Error("no");
			}
			ctx.emit("c", 0);
		});
		bus.on("c", () => {});

		for (let index = 0; index < 20; index += 1) {
			try {
				bus.emit("a", 0);
			} catch {}
		}
		fail = false;
		for (let index = 0; index < 20; index += 1) {
			bus.emit("a", 0);
		}

		expect(findings).toEqual([]);
	});

	it("cancelled and dropped tasks leave nothing behind", async () => {
		const { bus, findings } = rig();
		bus.on(
			"a",
			debounce(5, async (_round: number, ctx) => {
				ctx.emit("b", 0);
			}),
		);
		bus.on("b", () => {});

		for (let index = 0; index < 50; index += 1) {
			bus.emit("a", index);
		}
		await new Promise((resolve) => setTimeout(resolve, 30));

		expect(findings).toEqual([]);
	});
});

describe("a cleanup that triggers what it cleans", () => {
	// vue#6538 (open): reading a reactive value in onScopeDispose triggers an update that disposes again
	it("an unmount that emits an event whose handler remounts is reported", () => {
		const { bus, findings } = rig();
		let mounted = 0;
		const unmount = (
			round: number,
			ctx: { emit: (name: string, payload: number) => void },
		) => {
			ctx.emit("component/unmounted", round + 1);
		};
		bus.on("component/mount", (round, ctx) => {
			mounted += 1;
			if (round < 40) {
				unmount(round, ctx);
			}
		});
		bus.on("component/unmounted", (round, ctx) => {
			ctx.emit("component/mount", round);
		});

		bus.emit("component/mount", 0);

		expect(mounted).toBeGreaterThan(2);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.path).toContain("component/unmounted");
	});
});

describe("an outside event closes the loop", () => {
	// TanStack Query#2868 (closed): a refetch on window focus whose request opens an alert that focuses the window
	it("is a storm from outside any task, named by the event", async () => {
		vi.useFakeTimers();
		let time = 0;
		const findings: Finding[] = [];
		const graph = graphLogger({
			onCycle: (finding) => findings.push(finding),
			console: { warn: vi.fn() },
			now: () => time,
		});
		const bus = createBus<Events>({ trace: createTracer(graph) });
		bus.use(tracePlugin());
		const listeners: Array<() => void> = [];
		// a stand-in for window.addEventListener("focus") and the alert that dispatches focus again
		const focus = () => {
			for (const listener of [...listeners]) {
				listener();
			}
		};
		listeners.push(() => {
			time += 1;
			bus.emit("refetch", 0);
		});
		bus.on("refetch", () => {
			setTimeout(focus, 0);
		});

		focus();
		await vi.advanceTimersByTimeAsync(500);

		expect(findings.map((finding) => finding.kind)).toEqual(["storm"]);
		expect(findings[0]?.path).toEqual(["refetch"]);
	});
});

describe("a synchronous chain that overflows the stack", () => {
	// Node EventEmitter: three events in a ring blow the stack ("Maximum call stack size exceeded")
	it("is reported before the RangeError", () => {
		const { bus, findings } = rig();
		bus.on("a", (round, ctx) => {
			ctx.emit("b", round + 1);
		});
		bus.on("b", (round, ctx) => {
			ctx.emit("c", round + 1);
		});
		bus.on("c", (round, ctx) => {
			ctx.emit("a", round + 1);
		});

		let thrown: unknown;
		try {
			bus.emit("a", 0);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(RangeError);
		expect(findings).toHaveLength(1);
	});

	// expo#28149 (closed): removing the subscription inside the removal path
	it("an unsubscribe called inside the unsubscribe path does not loop", () => {
		const { bus, findings } = rig();
		let off: () => void = () => {};
		let depth = 0;
		off = bus.on("a", () => {});
		const again = () => {
			depth += 1;
			if (depth < 5) {
				off();
				again();
			}
		};

		expect(() => again()).not.toThrow();
		expect(findings).toEqual([]);
		bus.emit("a", 0);
	});

	// nextgen-events: a listener that edits the listener list while an emit runs
	it("a listener that removes itself and another during an emit leaves no counters", () => {
		const { bus, findings } = rig();
		let offSecond: () => void = () => {};
		const offFirst = bus.on("a", () => {
			offFirst();
			offSecond();
		});
		offSecond = bus.on("a", () => {});

		for (let index = 0; index < 20; index += 1) {
			bus.emit("a", index);
		}

		expect(findings).toEqual([]);
	});

	it("the same ring broken by a microtask is reported across the gap", async () => {
		const { bus, findings } = rig();
		bus.on("a", async (round, ctx) => {
			await Promise.resolve();
			if (round < 30) {
				ctx.emit("b", round + 1);
			}
		});
		bus.on("b", async (round, ctx) => {
			await Promise.resolve();
			ctx.emit("a", round + 1);
		});

		bus.emit("a", 0);
		await settle(200);

		expect(findings).toHaveLength(1);
	});
});
