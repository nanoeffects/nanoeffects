import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TraceEvent } from "../core/types";
import { createHarness, type TestEvents } from "../tests/test-helpers";
import { all, allSettled, delay, race, retry, type StarterOf, take } from ".";

describe("all, allSettled and race without a context as starters", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("a group in a group", () => {
		it("gives the result of an all inside a race and aborts the delay", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const waited = (child: { signal: AbortSignal }) => {
				signals.push(child.signal);

				return delay(child, 5000);
			};
			const result = await race(harness.ctx(), {
				loaded: all({
					user: retry(() => "user"),
					posts: retry(() => ["post"]),
				}),
				waited,
			});

			expect(result).toEqual({ loaded: { user: "user", posts: ["post"] } });
			expect(signals[0]?.aborted).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("gives an array of settled outcomes for an allSettled inside an all", async () => {
			const harness = createHarness();
			const failing = () => {
				throw new Error("boom");
			};
			const promise = all(harness.ctx(), [
				allSettled([retry(() => "user"), retry(failing, { times: 1 })]),
				delay(10),
			]);
			await vi.advanceTimersByTimeAsync(10);
			const result = await promise;

			expect(result[0][0]).toEqual({ status: "fulfilled", value: "user" });
			expect(result[0][1].status).toBe("rejected");
		});

		it("gives the winner of a race inside an all", async () => {
			const harness = createHarness();
			const promise = all(harness.ctx(), [
				race({ slow: delay(1000), fast: retry(() => "fast") }),
			]);
			await vi.advanceTimersByTimeAsync(0);

			await expect(promise).resolves.toEqual([{ fast: "fast" }]);
		});
	});

	describe("cancellation", () => {
		it("aborts the starters of the inner all when the outer race is won by another starter", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const load = (_payload: unknown, ctx: { signal: AbortSignal }) => {
				signals.push(ctx.signal);

				return new Promise<string>(() => {});
			};
			const result = race(harness.ctx(), {
				loaded: all({ user: retry(load, { times: 3 }) }),
				waited: delay(10),
			});
			await vi.advanceTimersByTimeAsync(10);

			await expect(result).resolves.toEqual({ waited: void 0 });
			expect(signals).toHaveLength(1);
			expect(signals[0]?.aborted).toBe(true);
		});

		it("cancels the siblings of a failed starter and fails the outer group", async () => {
			const harness = createHarness();
			const failure = new Error("boom");
			const siblings: AbortSignal[] = [];
			const sibling = (child: { signal: AbortSignal }) => {
				siblings.push(child.signal);

				return new Promise<string>(() => {});
			};
			const promise = all(harness.ctx(), {
				inner: all({
					broken: () => {
						throw failure;
					},
					sibling,
				}),
			});

			await expect(promise).rejects.toBe(failure);
			expect(siblings[0]?.aborted).toBe(true);
		});

		it("aborts the inner group with the outer one", async () => {
			const harness = createHarness();
			const inner = vi.fn((child: { signal: AbortSignal }) =>
				delay(child, 1000),
			);
			const ctx = harness.ctx();
			const promise = all(ctx, { inner: all({ inner }) });
			const outcome = expect(promise).rejects.toThrow("stop");
			await vi.advanceTimersByTimeAsync(0);
			ctx.abort(new Error("stop"));
			await outcome;

			expect(inner).toHaveBeenCalledTimes(1);
		});
	});

	describe("the form is told by the first argument and the count", () => {
		it("starts nothing until the group calls it", () => {
			const starter = vi.fn(() => "value");
			const grouped: StarterOf<TestEvents> = all({
				pause: delay(10),
				starter,
			});
			const settled: StarterOf<TestEvents> = allSettled([starter]);
			const raced: StarterOf<TestEvents> = race({ starter });

			expect([grouped, settled, raced]).toHaveLength(3);
			expect(starter).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("throws a TypeError for a context passed alone and starts nothing", () => {
			const harness = createHarness();
			const call = (group: (...args: never[]) => unknown) => () =>
				group(harness.ctx() as never);

			expect(call(all as never)).toThrow(TypeError);
			expect(call(allSettled as never)).toThrow(TypeError);
			expect(call(race as never)).toThrow(TypeError);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("treats an effects object with a key named signal as effects", async () => {
			const harness = createHarness();
			const starter: StarterOf<TestEvents> = all({
				signal: () => "value",
			});
			const result = await starter(harness.ctx());

			expect(result).toEqual({ signal: "value" });
		});

		it("takes effects and options as a starter with two arguments", async () => {
			const harness = createHarness();
			const starter = vi.fn(() => "value");
			const grouped = all(
				{ first: starter, second: starter },
				{ concurrency: 1 },
			);

			expect(typeof grouped).toBe("function");
			expect(starter).not.toHaveBeenCalled();
			const result = await (grouped as StarterOf<TestEvents>)(harness.ctx());

			expect(result).toEqual({ first: "value", second: "value" });
		});

		it("takes an array of effects and options as a starter", async () => {
			const harness = createHarness();
			const grouped = allSettled([() => 1, () => 2], { concurrency: 1 });

			expect(typeof grouped).toBe("function");
			const result = await (grouped as StarterOf<TestEvents>)(harness.ctx());

			expect(result).toEqual([
				{ status: "fulfilled", value: 1 },
				{ status: "fulfilled", value: 2 },
			]);
		});

		it("keeps a context with an array of effects in the ctx form", async () => {
			const harness = createHarness();
			const fromContext = all(harness.ctx(), [() => 1]);
			const fromEmpty = all({}, [() => 2]);

			expect(fromContext).toBeInstanceOf(Promise);
			expect(fromEmpty).toBeInstanceOf(Promise);
			expect(await fromContext).toEqual([1]);
			expect(await fromEmpty).toEqual([2]);
		});

		it("treats null options as no limit", async () => {
			const harness = createHarness();
			const grouped = all({ a: () => 1 }, null);
			const result = await (grouped as StarterOf<TestEvents>)(harness.ctx());

			expect(result).toEqual({ a: 1 });
		});

		it("keeps two empty objects as the ctx form", async () => {
			const result = all({}, {});

			expect(result).toBeInstanceOf(Promise);
			expect(await result).toEqual({});
		});

		it("tells a controller and a task context by their signal", async () => {
			const harness = createHarness();
			const controller = new AbortController();
			const withController = all(controller, { a: () => 1 });
			const withContext = allSettled(harness.ctx(), { a: () => 2 });

			expect(withController).toBeInstanceOf(Promise);
			expect(withContext).toBeInstanceOf(Promise);
			expect(await withController).toEqual({ a: 1 });
			expect(await withContext).toEqual({
				a: { status: "fulfilled", value: 2 },
			});
		});

		it("tells two arguments of race by the count", async () => {
			const result = race({}, { a: () => 1 });

			expect(result).toBeInstanceOf(Promise);
			expect(await result).toEqual({ a: 1 });
		});

		it("keeps an empty object as a context in the ctx form", async () => {
			const promise = all({}, { pause: delay(10) });
			await vi.advanceTimersByTimeAsync(10);
			const result = await promise;

			expect(result).toEqual({ pause: void 0 });
		});
	});

	describe("a stored group starter", () => {
		it("serves two outer groups", async () => {
			const harness = createHarness();
			const load: StarterOf<TestEvents> = all({
				user: retry(() => "user"),
			});
			const first = await all(harness.ctx(), { load });
			const second = await race(harness.ctx(), { load });

			expect(first).toEqual({ load: { user: "user" } });
			expect(second).toEqual({ load: { user: "user" } });
		});

		it("reads the effects when it is called", async () => {
			const harness = createHarness();
			const effects = { value: () => 1 };
			const starter: StarterOf<TestEvents> = all(effects);
			effects.value = () => 2;

			await expect(starter(harness.ctx())).resolves.toEqual({ value: 2 });
		});
	});

	describe("the trace", () => {
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

		it("is the trace of the wrapper that forwards the child", async () => {
			const wrapped = createHarness();
			const wrappedRace = race(wrapped.ctx(), {
				loaded: (child) =>
					all(child, { user: retry(() => "user"), left: take("b") }),
				settled: (child) => allSettled(child, [delay(10)]),
				winner: (child) => race(child, { fast: delay(1) }),
			});
			await vi.advanceTimersByTimeAsync(1);
			await wrappedRace;

			const short = createHarness();
			const shortRace = race(short.ctx(), {
				loaded: all({ user: retry(() => "user"), left: take("b") }),
				settled: allSettled([delay(10)]),
				winner: race({ fast: delay(1) }),
			});
			await vi.advanceTimersByTimeAsync(1);
			await shortRace;

			expect(shapeOf(short.recorder.events)).toEqual(
				shapeOf(wrapped.recorder.events),
			);
			expect(short.recorder.events.length).toBeGreaterThan(0);
		});
	});
});
