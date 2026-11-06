import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../core/bus";
import type { EventMap, Task } from "../core/types";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { batch } from "./batch";
import { debounce } from "./debounce";
import { dedupe } from "./dedupe";
import { distinct } from "./distinct";
import { latest } from "./latest";
import { leading } from "./leading";
import { queue } from "./queue";
import { rateLimit } from "./rate-limit";
import { throttle } from "./throttle";

// The newer policies around the older ones, and around each other. Each case says
// what the pair is for, and what has to hold when the two meet.

type Handler<P, R> = Task<P, TestEvents, R>;

// handlers that name no event map are typed over a plain one, and a context of the harness fits it
const contextOf = (harness: ReturnType<typeof createHarness>) =>
	harness.ctx() as never as Context<EventMap>;

describe("policies around each other", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("dedupe with the older policies", () => {
		it("latest(dedupe): a newer call aborts the older run, which is not shared with it", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const handler: Handler<number, Promise<string>> = (_value, ctx) => {
				signals.push(ctx.signal);
				return new Promise((resolve) => setTimeout(() => resolve("done"), 50));
			};
			const task = latest(dedupe(handler));
			const first = task(1, harness.ctx());
			const second = task(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(50);

			expect(signals).toHaveLength(2);
			expect(signals[0]?.aborted).toBe(true);
			expect(signals[1]?.aborted).toBe(false);
			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe("done");
		});

		it("dedupe(latest): callers with one key share the run of latest", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const task = dedupe(latest(handler));
			const results = await Promise.all([
				task(1, contextOf(harness)),
				task(1, contextOf(harness)),
			]);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(results).toEqual([1, 1]);
		});

		it("queue(dedupe): the queue runs one at a time, so a repeat starts a new run", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const task = queue(dedupe(handler));
			await Promise.all([
				task(1, contextOf(harness)),
				task(1, contextOf(harness)),
			]);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("dedupe(queue): the callers share the run, the queue sees one call", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const task = dedupe(queue(handler));
			const results = await Promise.all([
				task(1, contextOf(harness)),
				task(1, contextOf(harness)),
				task(2, contextOf(harness)),
			]);

			expect(handler).toHaveBeenCalledTimes(2);
			expect(results).toEqual([1, 1, 2]);
		});

		it("leading(dedupe): a call while a run goes is dropped before dedupe sees it", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const handler = vi.fn(() => gate.promise);
			const task = leading(dedupe(handler));
			const first = task(1, contextOf(harness));
			const second = task(1, contextOf(harness));
			gate.resolve("done");

			await expect(first).resolves.toBe("done");
			expect(second).toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("debounce(dedupe): only the last call of the burst reaches dedupe", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const task = debounce(100, dedupe(handler));
			task(1, contextOf(harness));
			task(1, contextOf(harness));
			const last = task(2, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(1);
			await expect(last).resolves.toBe(2);
		});

		it("throttle(dedupe): the leading and the trailing run of one payload do not overlap into one", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const task = throttle(100, dedupe(handler));
			task(1, contextOf(harness));
			task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("distinct with the older policies", () => {
		it("throttle(distinct): the trailing call with the same payload is skipped", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = throttle(100, distinct(handler));
			task(1, contextOf(harness));
			const trailing = task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(1);
			await expect(trailing).resolves.toBeUndefined();
		});

		it("debounce(distinct): a burst that ends where it started runs once", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = debounce(100, distinct(handler));
			task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);
			task(2, contextOf(harness));
			task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("latest(distinct): the aborted run is forgotten, so the same payload runs again", async () => {
			const harness = createHarness();
			const handler = vi.fn(
				(_value: number, ctx: { signal: AbortSignal }) =>
					new Promise<string>((resolve, reject) => {
						ctx.signal.addEventListener("abort", () =>
							reject(ctx.signal.reason),
						);
						setTimeout(() => resolve("done"), 50);
					}),
			);
			const task = latest(distinct(handler));
			const first = task(1, contextOf(harness));
			first?.catch(() => {});
			const second = task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(50);

			expect(handler).toHaveBeenCalledTimes(2);
			await expect(second).resolves.toBe("done");
		});

		it("queue(distinct): a repeat that waits behind the first is skipped when its turn comes", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const task = queue(distinct(handler));
			const results = await Promise.all([
				task(1, contextOf(harness)),
				task(1, contextOf(harness)),
				task(2, contextOf(harness)),
			]);

			expect(handler).toHaveBeenCalledTimes(2);
			expect(results).toEqual([1, void 0, 2]);
		});
	});

	describe("rateLimit with the older policies", () => {
		it("queue(rateLimit): waiting calls keep their order and the queue frees its slot", async () => {
			const harness = createHarness();
			const order: number[] = [];
			const task = queue(
				rateLimit(1, 100, (value: number) => {
					order.push(value);
				}),
			);
			for (const value of [1, 2, 3]) {
				task(value, contextOf(harness));
			}
			await vi.advanceTimersByTimeAsync(300);

			expect(order).toEqual([1, 2, 3]);
		});

		it("rateLimit(queue): the window counts the calls the queue takes, not the runs it starts", async () => {
			const harness = createHarness();
			const gate = deferred<void>();
			const handler = vi.fn((_value: number) => gate.promise);
			const task = rateLimit(2, 1000, queue(handler));
			task(1, contextOf(harness));
			task(2, contextOf(harness));
			task(3, contextOf(harness));

			// the third call waits for the window; the queue holds the second for the first
			expect(handler).toHaveBeenCalledTimes(1);
			gate.resolve();
			await vi.advanceTimersByTimeAsync(0);
			expect(handler).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(1000);
			expect(handler).toHaveBeenCalledTimes(3);
		});

		it("latest(rateLimit): the newer call aborts a run that started and keeps its place in the window", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const handler = vi.fn((_value: number, ctx: { signal: AbortSignal }) => {
				signals.push(ctx.signal);
				return new Promise<void>(() => {});
			});
			const task = latest(rateLimit(1, 100, handler));
			task(1, contextOf(harness));
			const second = task(2, contextOf(harness));
			expect(signals[0]?.aborted).toBe(true);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(2);
			second?.catch(() => {});
		});

		it("leading(rateLimit): leading drops a call made while one is running; a later call waits for the window", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const task = leading(rateLimit(1, 100, handler));
			task(1, contextOf(harness));
			const dropped = task(2, contextOf(harness));
			await vi.advanceTimersByTimeAsync(0);
			const third = task(3, contextOf(harness));

			expect(dropped).toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(100);
			expect(handler).toHaveBeenCalledTimes(2);
			await expect(third).resolves.toBe(3);
		});

		it("debounce(rateLimit): a call that waits for the window is aborted by the next debounced one", async () => {
			const harness = createHarness();
			const starts: number[] = [];
			const task = debounce(
				10,
				rateLimit(1, 100, () => {
					starts.push(Date.now());
				}),
			);
			const origin = Date.now();
			task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(10);
			const second = task(2, contextOf(harness));
			await vi.advanceTimersByTimeAsync(10);
			task(3, contextOf(harness));
			await vi.advanceTimersByTimeAsync(300);

			// the run of the second call waited for the window when the third call came, and was aborted
			expect(starts).toEqual([origin + 10, origin + 110]);
			await expect(second).resolves.toBeUndefined();
		});
	});

	describe("batch with the older policies", () => {
		it("queue(batch): the queue lets one call into the batch at a time, so each batch holds one payload", async () => {
			const harness = createHarness();
			const sent: number[][] = [];
			const task = queue(
				batch(100, async (values: number[]) => {
					sent.push(values);
					return values.length;
				}),
			);
			const results = [
				task(1, contextOf(harness)),
				task(2, contextOf(harness)),
			];
			await vi.advanceTimersByTimeAsync(200);

			expect(sent).toEqual([[1], [2]]);
			await expect(Promise.all(results)).resolves.toEqual([1, 1]);
		});

		it("latest(batch): a newer call aborts the older, which leaves the batch", async () => {
			const harness = createHarness();
			const sent: number[][] = [];
			const task = latest(
				batch(100, async (values: number[]) => {
					sent.push(values);
				}),
			);
			const first = task(1, contextOf(harness));
			task(2, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);

			expect(sent).toEqual([[2]]);
			await expect(first).resolves.toBeUndefined();
		});

		it("batch(latest): the handler runs as latest, so a second batch aborts the first", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const task = batch(
				100,
				latest((_values: number[], ctx: { signal: AbortSignal }) => {
					signals.push(ctx.signal);
					return new Promise<void>(() => {});
				}),
			);
			task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);
			task(2, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);

			expect(signals).toHaveLength(2);
			expect(signals[0]?.aborted).toBe(true);
		});

		it("batch(queue): batches that overlap in time run one after the other", async () => {
			const harness = createHarness();
			let running = 0;
			let peak = 0;
			const task = batch(
				10,
				queue(async (_values: number[]) => {
					running++;
					peak = Math.max(peak, running);
					await new Promise((resolve) => setTimeout(resolve, 100));
					running--;
				}),
			);
			for (let index = 0; index < 5; index++) {
				task(index, contextOf(harness));
				await vi.advanceTimersByTimeAsync(10);
			}
			await vi.advanceTimersByTimeAsync(1000);

			expect(peak).toBe(1);
		});

		it("debounce(batch): the debounce keeps only the last call, so the batch holds one payload", async () => {
			const harness = createHarness();
			const sent: number[][] = [];
			const task = debounce(
				20,
				batch(50, async (values: number[]) => {
					sent.push(values);
				}),
			);
			task(1, contextOf(harness));
			task(2, contextOf(harness));
			task(3, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);

			expect(sent).toEqual([[3]]);
		});
	});

	describe("the newer policies around each other", () => {
		it("dedupe(distinct): a repeat while the first goes shares the run; one after it is skipped", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const handler = vi.fn((_value: number) => gate.promise);
			const task = dedupe(distinct(handler));
			const first = task(1, contextOf(harness));
			const second = task(1, contextOf(harness));
			gate.resolve("done");

			await expect(Promise.all([first, second])).resolves.toEqual([
				"done",
				"done",
			]);
			await expect(task(1, contextOf(harness))).resolves.toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("distinct(dedupe): a payload that was seen is skipped before dedupe, even after the run", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const task = distinct(dedupe(handler));
			await task(1, contextOf(harness));

			expect(task(1, contextOf(harness))).toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("rateLimit(batch): the window counts calls, so the second call joins a later batch", async () => {
			const harness = createHarness();
			const sent: number[][] = [];
			const task = rateLimit(
				1,
				1000,
				batch(100, async (values: number[]) => {
					sent.push(values);
				}),
			);
			task(1, contextOf(harness));
			task(2, contextOf(harness));
			await vi.advanceTimersByTimeAsync(100);

			expect(sent).toEqual([[1]]);
			await vi.advanceTimersByTimeAsync(2000);
			expect(sent).toEqual([[1], [2]]);
		});

		it("batch(rateLimit): the batch handler waits for the window as any call does", async () => {
			const harness = createHarness();
			const sent: number[][] = [];
			const task = batch(
				10,
				rateLimit(1, 100, async (values: number[]) => {
					sent.push(values);
				}),
			);
			task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(10);
			task(2, contextOf(harness));
			await vi.advanceTimersByTimeAsync(10);
			task(3, contextOf(harness));
			await vi.advanceTimersByTimeAsync(500);

			expect(sent).toEqual([[1], [2], [3]]);
		});

		it("batch(dedupe): callers whose batches are equal share the handler run", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const handler = vi.fn((_values: number[]) => gate.promise);
			const task = batch(10, dedupe(handler), { key: () => "all" });
			task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(10);
			const second = task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(10);
			gate.resolve("done");

			expect(handler).toHaveBeenCalledTimes(2);
			await expect(second).resolves.toBe("done");
		});

		it("batch(distinct): a batch whose payloads are the same list is not sent twice in a row", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (values: number[]) => values.length);
			const task = batch(
				10,
				distinct(handler, {
					equals: (left, right) => left.join() === right.join(),
				}),
			);
			task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(10);
			task(1, contextOf(harness));
			await vi.advanceTimersByTimeAsync(10);

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("nothing is left behind", () => {
		it("leaves no timer after a stack of all five of the newer and older policies finishes", async () => {
			const harness = createHarness();
			const task = rateLimit(
				2,
				50,
				queue(dedupe(distinct(async (_value: number) => "done"))),
			);
			for (let index = 0; index < 20; index++) {
				task(index % 3, contextOf(harness));
			}
			await vi.advanceTimersByTimeAsync(1000);

			expect(vi.getTimerCount()).toBe(0);
		});
	});
});
