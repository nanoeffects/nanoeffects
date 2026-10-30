import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { TraceEvent } from "../core/types";
import { createHarness } from "../tests/test-helpers";
import { all, allSettled, delay, effectsPlugin, race } from ".";

// a starter that takes `ms`, and records how many run at once
const tracker = () => {
	let running = 0;
	let peak = 0;
	const calls: number[] = [];
	const job = (id: number, ms = 10) => {
		return async (child: { signal: AbortSignal }) => {
			calls.push(id);
			running++;
			peak = Math.max(peak, running);
			try {
				await delay(child, ms);
			} finally {
				running--;
			}

			return id;
		};
	};

	return { job, calls, peak: () => peak };
};

describe("the concurrency option of all and allSettled", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("the limit", () => {
		it("keeps at most N in flight and the order of the results", async () => {
			const harness = createHarness();
			const track = tracker();
			const promise = all(
				harness.ctx(),
				[1, 2, 3, 4, 5, 6, 7].map((id) => track.job(id)),
				{ concurrency: 3 },
			);
			await vi.advanceTimersByTimeAsync(100);

			await expect(promise).resolves.toEqual([1, 2, 3, 4, 5, 6, 7]);
			expect(track.peak()).toBe(3);
			expect(track.calls).toEqual([1, 2, 3, 4, 5, 6, 7]);
		});

		it("runs an object of starters one after another with 1", async () => {
			const harness = createHarness();
			const track = tracker();
			const promise = all(
				harness.ctx(),
				{ a: track.job(1), b: track.job(2), c: track.job(3) },
				{ concurrency: 1 },
			);
			await vi.advanceTimersByTimeAsync(10);
			expect(track.calls).toEqual([1, 2]);
			await vi.advanceTimersByTimeAsync(20);

			await expect(promise).resolves.toEqual({ a: 1, b: 2, c: 3 });
			expect(track.peak()).toBe(1);
		});

		it("starts all at once without the option, with Infinity, null or undefined", async () => {
			for (const options of [void 0, null, {}, { concurrency: Infinity }]) {
				const harness = createHarness();
				const track = tracker();
				const promise = all(
					harness.ctx(),
					[1, 2, 3, 4].map((id) => track.job(id)),
					options,
				);
				await vi.advanceTimersByTimeAsync(10);
				await promise;

				expect(track.peak()).toBe(4);
			}
		});

		it("works for allSettled and gives its entries in order", async () => {
			const harness = createHarness();
			const track = tracker();
			const promise = allSettled(
				harness.ctx(),
				[1, 2, 3].map((id) => track.job(id)),
				{ concurrency: 2 },
			);
			await vi.advanceTimersByTimeAsync(100);

			await expect(promise).resolves.toEqual([
				{ status: "fulfilled", value: 1 },
				{ status: "fulfilled", value: 2 },
				{ status: "fulfilled", value: 3 },
			]);
			expect(track.peak()).toBe(2);
		});

		it("resolves an empty list", async () => {
			const harness = createHarness();

			await expect(all(harness.ctx(), [], { concurrency: 2 })).resolves.toEqual(
				[],
			);
		});
	});

	describe("a failure and an abort", () => {
		it("all cancels the running starters and calls no waiting one", async () => {
			const harness = createHarness();
			const failure = new Error("boom");
			const signals: AbortSignal[] = [];
			const called: string[] = [];
			const hang = (child: { signal: AbortSignal }) => {
				called.push("hang");
				signals.push(child.signal);

				return new Promise<string>(() => {});
			};
			const broken = () => {
				called.push("broken");
				throw failure;
			};
			const later = () => {
				called.push("later");

				return "later";
			};
			const promise = all(harness.ctx(), [hang, broken, later, later], {
				concurrency: 2,
			});

			await expect(promise).rejects.toBe(failure);
			await vi.advanceTimersByTimeAsync(10);
			expect(called).toEqual(["hang", "broken"]);
			expect(signals[0]?.aborted).toBe(true);
		});

		it("allSettled goes on after a failure", async () => {
			const harness = createHarness();
			const track = tracker();
			const broken = () => {
				throw new Error("boom");
			};
			const promise = allSettled(
				harness.ctx(),
				[broken, track.job(2), track.job(3), track.job(4)],
				{ concurrency: 2 },
			);
			await vi.advanceTimersByTimeAsync(100);
			const result = await promise;

			expect(result.map((entry) => entry.status)).toEqual([
				"rejected",
				"fulfilled",
				"fulfilled",
				"fulfilled",
			]);
			expect(track.calls).toEqual([2, 3, 4]);
		});

		it("an abort of ctx stops the running and starts no waiting starter", async () => {
			for (const group of [all, allSettled]) {
				const harness = createHarness();
				const ctx = harness.ctx();
				const track = tracker();
				const promise = group(
					ctx,
					[1, 2, 3, 4].map((id) => track.job(id, 1000)),
					{ concurrency: 2 },
				);
				const outcome = expect(promise).rejects.toThrow("stop");
				await vi.advanceTimersByTimeAsync(10);
				ctx.abort(new Error("stop"));
				await outcome;
				await vi.advanceTimersByTimeAsync(2000);

				expect(track.calls).toEqual([1, 2]);
				expect(vi.getTimerCount()).toBe(0);
			}
		});
	});

	describe("an invalid value", () => {
		it("throws a RangeError before anything starts", () => {
			for (const concurrency of [0, -1, Number.NaN, 1.5, "2" as never]) {
				const harness = createHarness();
				const starter = vi.fn(() => "value");

				expect(() => all(harness.ctx(), [starter], { concurrency })).toThrow(
					RangeError,
				);
				expect(() =>
					allSettled(harness.ctx(), [starter], { concurrency }),
				).toThrow(RangeError);
				expect(starter).not.toHaveBeenCalled();
				expect(harness.recorder.events).toHaveLength(0);
				expect(vi.getTimerCount()).toBe(0);
			}
		});
	});

	describe("the trace", () => {
		const shapeOf = (events: ReadonlyArray<TraceEvent>) => {
			const places = new Map(events.map((event, index) => [event.id, index]));

			return events.map((event) => ({
				effect: event.effect,
				phase: event.phase,
				parent: places.get(event.parentId ?? -1),
				root: places.get(event.rootId ?? -1),
			}));
		};

		it("is the trace without the option when the limit is large", async () => {
			const plain = createHarness();
			const plainTrack = tracker();
			const plainPromise = all(
				plain.ctx(),
				[1, 2, 3].map((id) => plainTrack.job(id)),
			);
			await vi.advanceTimersByTimeAsync(10);
			await plainPromise;

			const limited = createHarness();
			const limitedTrack = tracker();
			const limitedPromise = all(
				limited.ctx(),
				[1, 2, 3].map((id) => limitedTrack.job(id)),
				{ concurrency: 10 },
			);
			await vi.advanceTimersByTimeAsync(10);
			await limitedPromise;

			expect(shapeOf(limited.recorder.events)).toEqual(
				shapeOf(plain.recorder.events),
			);
			expect(plain.recorder.events.length).toBeGreaterThan(0);
		});

		it("starts a group once and a run when its starter starts", async () => {
			const harness = createHarness();
			const track = tracker();
			const promise = all(
				harness.ctx(),
				[1, 2, 3].map((id) => track.job(id)),
				{ concurrency: 1 },
			);
			await vi.advanceTimersByTimeAsync(0);
			const runStarts = () =>
				harness.recorder.events.filter(
					(event) => event.effect === "run" && event.phase === "start",
				);
			expect(runStarts()).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(30);
			await promise;
			const groups = harness.recorder.events.filter(
				(event) => event.effect === "all" && event.phase === "start",
			);
			const runs = harness.recorder.events.filter(
				(event) => event.effect === "run",
			);
			const secondStart = harness.recorder.events.findIndex(
				(event, index) =>
					event.effect === "run" &&
					event.phase === "start" &&
					index >
						harness.recorder.events.findIndex(
							(first) => first.effect === "run" && first.phase === "done",
						),
			);

			expect(groups).toHaveLength(1);
			expect(runs.filter((event) => event.phase === "start")).toHaveLength(3);
			expect(secondStart).toBeGreaterThan(-1);
		});

		it("traces no run for a starter that never starts", async () => {
			const harness = createHarness();
			const broken = () => {
				throw new Error("boom");
			};
			const later = vi.fn();
			await expect(
				all(harness.ctx(), [broken, later, later], { concurrency: 1 }),
			).rejects.toThrow("boom");

			const runs = harness.recorder.events.filter(
				(event) => event.effect === "run" && event.phase === "start",
			);
			expect(runs).toHaveLength(1);
			expect(later).not.toHaveBeenCalled();
		});
	});

	describe("the effects bound by effectsPlugin", () => {
		it("pass the options on", async () => {
			const bus = createBus<{ go: undefined }>().use(effectsPlugin({ all }));
			const track = tracker();
			const done = new Promise<number[]>((resolve) => {
				bus.on("go", async (_, { all: boundAll }) => {
					resolve(
						await boundAll(
							[1, 2, 3, 4].map((id) => track.job(id)),
							{
								concurrency: 2,
							},
						),
					);
				});
			});
			bus.emit("go", void 0);
			await vi.advanceTimersByTimeAsync(100);

			await expect(done).resolves.toEqual([1, 2, 3, 4]);
			expect(track.peak()).toBe(2);
		});
	});

	describe("race", () => {
		it("takes no limit and starts everything", async () => {
			const harness = createHarness();
			const track = tracker();
			const promise = race(harness.ctx(), [track.job(1, 5), track.job(2, 50)]);
			await vi.advanceTimersByTimeAsync(5);
			await promise;

			expect(track.calls).toEqual([1, 2]);
		});
	});
});
