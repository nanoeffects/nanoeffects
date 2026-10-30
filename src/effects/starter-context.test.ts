import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommand, createModule, modulePlugin } from "../actions";
import { createBus } from "../core/bus";
import type { TraceEvent } from "../core/types";
import { scopePlugin } from "../scope";
import { createHarness } from "../tests/test-helpers";
import {
	all,
	allSettled,
	delay,
	effectsPlugin,
	poll,
	race,
	retry,
	take,
	timeout,
} from ".";

describe("the context of a starter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("with a task context", () => {
		it("is a context of its own child: take works on it", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = race(ctx, {
				cancelled: (child) => take(child, "b"),
				waited: (child) => delay(child, 1000),
			});
			harness.bus.emit("b", "stop");

			await expect(promise).resolves.toEqual({ cancelled: "stop" });
			expect(ctx.signal.aborted).toBe(false);
		});

		it("aborts the loser through its child", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const promise = race(harness.ctx(), {
				waited: (child) => {
					signals.push(child.signal);
					return delay(child, 1000);
				},
				cancelled: (child) => take(child, "b"),
			});
			harness.bus.emit("b", "stop");
			await promise;

			expect(signals[0]?.aborted).toBe(true);
		});

		it("leaves no listener when the race ends", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const seen: string[] = [];
			const promise = race(ctx, {
				waited: (child) => delay(child, 10),
				cancelled: (child) => take(child, "b"),
			});
			await vi.advanceTimersByTimeAsync(10);
			await promise;
			harness.bus.on("b", (value) => {
				seen.push(value);
			});
			harness.bus.emit("b", "after");

			expect(seen).toEqual(["after"]);
		});

		it("is given to all, allSettled and timeout", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const kinds = async () => [
				await all(ctx, { a: (child) => typeof child.on }),
				await allSettled(ctx, [(child) => typeof child.emit]),
				await timeout(ctx, 100, (child) => typeof child.run),
			];

			await expect(kinds()).resolves.toEqual([
				{ a: "function" },
				[{ status: "fulfilled", value: "function" }],
				"function",
			]);
		});

		it("keeps the old starter that reads only the signal", async () => {
			const harness = createHarness();
			const result = await race(harness.ctx(), {
				value: ({ signal }) => (signal.aborted ? "aborted" : "live"),
			});

			expect(result).toEqual({ value: "live" });
		});

		it("shows the listener of a starter under its run task in the trace", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = all(ctx, { next: (child) => take(child, "b") });
			harness.bus.emit("b", "x");
			await promise;
			const run = harness.recorder.events.find(
				(event) => event.effect === "run",
			);
			const wait = harness.recorder.events.find(
				(event) => event.effect === "take",
			);

			expect(wait?.parentId).toBe(run?.id);
		});
	});

	describe("a starter made by delay and take", () => {
		// ids differ between two runs: an event is its place in the trace and the place of its parent
		const shapeOf = (events: ReadonlyArray<TraceEvent>) => {
			const places = new Map(events.map((event, index) => [event.id, index]));

			return events.map((event) => ({
				effect: event.effect,
				phase: event.phase,
				traceGroupId: event.traceGroupId,
				parent: places.get(event.parentId ?? -1),
				root: places.get(event.rootId ?? -1),
			}));
		};

		it("gives the same trace as the wrapper that forwards the child", async () => {
			const wrapped = createHarness();
			const wrappedRace = race(wrapped.ctx(), {
				cancelled: (child) => take(child, "b"),
				waited: (child) => delay(child, 1000),
			});
			wrapped.bus.emit("b", "stop");
			await wrappedRace;

			const short = createHarness();
			const shortRace = race(short.ctx(), {
				cancelled: take("b"),
				waited: delay(1000),
			});
			short.bus.emit("b", "stop");
			await shortRace;

			expect(shapeOf(short.recorder.events)).toEqual(
				shapeOf(wrapped.recorder.events),
			);
			expect(short.recorder.events.length).toBeGreaterThan(0);
		});

		it("gives the same trace for the Task of retry, timeout and poll as for the wrapper", async () => {
			const hang = () => new Promise<string>(() => {});
			const wrapped = createHarness();
			const wrappedRace = race(wrapped.ctx(), {
				retried: (child) => retry(child, hang, { times: 2 }),
				limited: (child) => timeout(child, 5000, hang),
				polled: (child) => poll(child, () => {}, 100),
				left: (child) => take(child, "b"),
			});
			await vi.advanceTimersByTimeAsync(250);
			wrapped.bus.emit("b", "leave");
			await wrappedRace;

			const short = createHarness();
			const shortRace = race(short.ctx(), {
				retried: retry(hang, { times: 2 }),
				limited: timeout(5000, hang),
				polled: poll(100, () => {}),
				left: take("b"),
			});
			await vi.advanceTimersByTimeAsync(250);
			short.bus.emit("b", "leave");
			await shortRace;

			expect(shapeOf(short.recorder.events)).toEqual(
				shapeOf(wrapped.recorder.events),
			);
			expect(short.recorder.events.length).toBeGreaterThan(0);
		});

		it("traces a stored starter under each group that calls it", async () => {
			const harness = createHarness();
			const pause = delay(10);
			const first = all(harness.ctx(), { pause });
			const second = all(harness.ctx(), { pause });
			await vi.advanceTimersByTimeAsync(10);
			await Promise.all([first, second]);
			const groups = harness.recorder.events.filter(
				(event) => event.effect === "all" && event.phase === "start",
			);

			expect(groups).toHaveLength(2);
		});
	});

	describe("without a task context", () => {
		it("gets a signal and an abort", async () => {
			const parent = new AbortController();
			const result = await all(parent, {
				seen: (child) => [typeof child.signal, typeof child.abort],
			});

			expect(result).toEqual({ seen: ["object", "function"] });
		});

		it("lets delay take the starter", async () => {
			const promise = all(
				{},
				{ waited: (child) => delay(child, 50).then(() => "done") },
			);
			await vi.advanceTimersByTimeAsync(50);

			await expect(promise).resolves.toEqual({ waited: "done" });
		});

		it("does not type take on it", () => {
			// the child has no bus, so the checker refuses it; the call is never run
			const never = () =>
				all(
					{},
					{
						// @ts-expect-error take needs a task context
						wait: (child) => take(child, "b"),
					},
				);

			expect(never).toBeTypeOf("function");
		});
	});

	describe("with effectsPlugin", () => {
		it("binds the effects to the child, so the loser stops", async () => {
			const bus = createBus<{ run: undefined; stop: undefined }>().use(
				effectsPlugin({ delay, race, take }),
			);
			const outcomes: string[] = [];

			bus.on("run", async (_, ctx) => {
				const result = await ctx.race({
					cancelled: ({ take }) => take("stop").then(() => "stopped"),
					waited: ({ delay }) =>
						delay(1000).then(
							() => "waited",
							() => "aborted",
						),
				});
				outcomes.push(JSON.stringify(result), String(ctx.signal.aborted));
			});
			bus.emit("run");
			bus.emit("stop");
			await vi.advanceTimersByTimeAsync(0);

			expect(outcomes).toEqual(['{"cancelled":"stopped"}', "false"]);
		});

		it("keeps the delay of the caller bound to the caller", async () => {
			const bus = createBus<{ run: undefined }>().use(
				effectsPlugin({ delay, race }),
			);
			const seen: boolean[] = [];

			bus.on("run", async (_, ctx) => {
				await ctx.race({
					first: (child) =>
						seen.push(Reflect.get(child, "delay") === ctx.delay),
				});
			});
			bus.emit("run");
			await vi.advanceTimersByTimeAsync(0);

			expect(seen).toEqual([false]);
		});

		it("leaves a field that is not its own", async () => {
			const own = () => "mine";
			const bus = createBus<{ run: undefined }>({
				context: { delay: own },
			}).use(effectsPlugin({ race }));
			const seen: unknown[] = [];

			bus.on("run", async (_, ctx) => {
				await ctx.race({
					a: (child) => seen.push(Reflect.get(child, "delay")),
				});
			});
			bus.emit("run");
			await vi.advanceTimersByTimeAsync(0);

			expect(seen).toEqual([own]);
		});
	});

	describe("with a scope", () => {
		it("carries the scope of a module, bound to the child", async () => {
			const signals: AbortSignal[] = [];
			const watch = (ctx: { signal: AbortSignal }) => {
				signals.push(ctx.signal);
				return new Promise<string>(() => {});
			};
			const seen: unknown[] = [];
			const feature = createModule(
				"feature",
				(moduleContext) => {
					moduleContext.on("module/run", async (_, ctx) => {
						await race(ctx, {
							done: (child) => seen.push(Reflect.get(child, "label")),
							waiting: (child) => Reflect.get(child, "watch")(),
						});
					});
				},
				{ label: "module", $effects: { watch } },
			);
			const bus = createBus();
			bus.use(scopePlugin());
			bus.use(modulePlugin([feature]));
			await vi.advanceTimersByTimeAsync(0);

			bus.emit("module/run");
			await vi.advanceTimersByTimeAsync(0);

			expect(seen).toEqual(["module"]);
			expect(signals).toHaveLength(1);
			expect(signals[0]?.aborted).toBe(true);
		});

		it("carries the fields of a scope", async () => {
			const bus = createBus().use(scopePlugin());
			const seen: unknown[] = [];
			const load = createCommand(
				"load",
				async (_: undefined, ctx) => {
					await all(ctx, {
						field: (child) => seen.push(Reflect.get(child, "label")),
					});
				},
				{ label: "scoped" },
			);

			await bus.emit(load(void 0));

			expect(seen).toEqual(["scoped"]);
		});
	});
});
