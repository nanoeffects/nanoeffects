// The newer policies against a plain model that anyone can read: random calls, the policy and the model
// say what they did, and the two have to agree. Heavy cases check that cost does not grow with the load.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness } from "../tests/test-helpers";
import { batch } from "./batch";
import { dedupe } from "./dedupe";
import { distinct } from "./distinct";
import { rateLimit } from "./rate-limit";

const mulberry32 = (seed: number) => {
	let first = seed;
	return () => {
		first = (first + 0x6d2b79f5) | 0;
		let mixed = Math.imul(first ^ (first >>> 15), 1 | first);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
};

const seeds = Array.from({ length: 200 }, (_, index) => index + 1);

describe("the newer policies against a model", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.each(seeds)(
		"distinct runs when the payload of its key changed: seed %i",
		(seed) => {
			const random = mulberry32(seed);
			const int = (max: number) => Math.floor(random() * max);
			const harness = createHarness();
			const ran: number[] = [];
			const task = distinct(
				(value: number) => {
					ran.push(value);
				},
				{ key: (value) => value % 4 },
			);
			const expected: number[] = [];
			const last = new Map<number, number>();
			for (let step = 0; step < 300; step++) {
				const value = int(12);
				task(value, harness.ctx() as never);
				const key = value % 4;
				if (last.get(key) !== value) {
					expected.push(value);
					last.set(key, value);
				}
			}

			expect(ran).toEqual(expected);
		},
	);

	it.each(seeds)(
		"rateLimit starts each call at the time its window allows: seed %i",
		async (seed) => {
			const random = mulberry32(seed);
			const int = (max: number) => Math.floor(random() * max);
			const harness = createHarness();
			const limit = 1 + int(4);
			const ms = 10 + int(70);
			const started: number[] = [];
			const task = rateLimit(limit, ms, (_value: number) => {
				started.push(Date.now());
			});

			const origin = Date.now();
			const callTimes: number[] = [];
			let now = 0;
			const count = 20 + int(40);
			for (let index = 0; index < count; index++) {
				now += int(25);
				callTimes.push(now);
			}
			let at = 0;
			for (const [index, time] of callTimes.entries()) {
				await vi.advanceTimersByTimeAsync(time - at);
				at = time;
				task(index, harness.ctx() as never);
			}
			await vi.advanceTimersByTimeAsync(count * ms + 1000);

			// call i starts when it has come, the call before it has started, and the call `limit` places back left the window
			const expected: number[] = [];
			for (const [index, time] of callTimes.entries()) {
				const previous = index > 0 ? (expected[index - 1] ?? 0) : 0;
				const back = index >= limit ? (expected[index - limit] ?? 0) + ms : 0;
				expected.push(Math.max(time, previous, back));
			}
			expect(started.map((time) => time - origin)).toEqual(expected);
		},
	);

	it.each(seeds)(
		"batch groups the calls of each window: seed %i",
		async (seed) => {
			const random = mulberry32(seed);
			const int = (max: number) => Math.floor(random() * max);
			const harness = createHarness();
			const ms = 10 + int(60);
			const maxSize = random() < 0.5 ? 1 + int(6) : Number.POSITIVE_INFINITY;
			const sent: Array<{ at: number; payloads: number[] }> = [];
			const origin = Date.now();
			const task = batch(
				ms,
				(payloads: number[]) => {
					sent.push({ at: Date.now() - origin, payloads });
				},
				{ maxSize },
			);

			const callTimes: number[] = [];
			let now = 0;
			const count = 20 + int(60);
			for (let index = 0; index < count; index++) {
				now += int(30);
				callTimes.push(now);
			}
			let at = 0;
			for (const [index, time] of callTimes.entries()) {
				await vi.advanceTimersByTimeAsync(time - at);
				at = time;
				task(index, harness.ctx() as never);
			}
			await vi.advanceTimersByTimeAsync(ms + 1);

			// a window opens at the first call, closes `ms` later, or when it holds `maxSize` payloads
			const expected: Array<{ at: number; payloads: number[] }> = [];
			let open: { opened: number; payloads: number[] } | null = null;
			for (const [index, time] of callTimes.entries()) {
				if (open && time >= open.opened + ms) {
					expected.push({ at: open.opened + ms, payloads: open.payloads });
					open = null;
				}
				open = open ?? { opened: time, payloads: [] };
				open.payloads.push(index);
				if (open.payloads.length >= maxSize) {
					expected.push({ at: time, payloads: open.payloads });
					open = null;
				}
			}
			if (open) {
				expected.push({ at: open.opened + ms, payloads: open.payloads });
			}
			expect(sent).toEqual(expected);
		},
	);

	it.each(seeds)(
		"dedupe shares a run for as long as it lasts: seed %i",
		async (seed) => {
			const random = mulberry32(seed);
			const int = (max: number) => Math.floor(random() * max);
			const harness = createHarness();
			const durations = Array.from({ length: 400 }, () => 5 + int(60));
			let runs = 0;
			const task = dedupe(async (_key: number) => {
				const run = runs++;
				await new Promise((resolve) => setTimeout(resolve, durations[run]));
				return run;
			});

			const calls: Array<{
				key: number;
				time: number;
				result: Promise<number | undefined>;
			}> = [];
			let now = 0;
			let at = 0;
			for (let index = 0; index < 120; index++) {
				now += int(25);
				await vi.advanceTimersByTimeAsync(now - at);
				at = now;
				const key = int(4);
				calls.push({
					key,
					time: now,
					result: task(key, harness.ctx() as never),
				});
			}
			await vi.advanceTimersByTimeAsync(10_000);

			// a call joins the run of its key if that run is still going, otherwise it starts the next run
			const busyUntil = new Map<number, number>();
			const runOf = new Map<number, number>();
			let modelRuns = 0;
			const expected: number[] = [];
			for (const call of calls) {
				const until = busyUntil.get(call.key);
				if (until === void 0 || call.time >= until) {
					const run = modelRuns++;
					busyUntil.set(call.key, call.time + (durations[run] ?? 0));
					runOf.set(call.key, run);
				}
				expected.push(runOf.get(call.key) ?? -1);
			}

			expect(runs).toBe(modelRuns);
			expect(await Promise.all(calls.map((call) => call.result))).toEqual(
				expected,
			);
		},
	);
});

describe("the newer policies under load", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("dedupe: 50 000 keys at once, each run once, nothing kept", async () => {
		const harness = createHarness();
		const handler = vi.fn(async (value: number) => value);
		const task = dedupe(handler);
		const calls: Array<Promise<number | undefined>> = [];
		for (let index = 0; index < 50_000; index++) {
			calls.push(task(index, harness.ctx() as never));
		}
		const results = await Promise.all(calls);

		expect(handler).toHaveBeenCalledTimes(50_000);
		expect(results[49_999]).toBe(49_999);
	}, 30_000);

	it("dedupe: 20 000 callers of one key share one run", async () => {
		const harness = createHarness();
		const handler = vi.fn(async (value: number) => value);
		const task = dedupe(handler, { key: () => "all" });
		const calls: Array<Promise<number | undefined>> = [];
		for (let index = 0; index < 20_000; index++) {
			calls.push(task(index, harness.ctx() as never));
		}
		const results = await Promise.all(calls);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(new Set(results)).toEqual(new Set([0]));
	}, 30_000);

	it("distinct: 50 000 keys, a repeat of each is skipped", () => {
		const harness = createHarness();
		const handler = vi.fn((value: number) => value);
		const task = distinct(handler, { key: (value) => value });
		for (let index = 0; index < 50_000; index++) {
			task(index, harness.ctx() as never);
		}
		for (let index = 0; index < 50_000; index++) {
			task(index, harness.ctx() as never);
		}

		expect(handler).toHaveBeenCalledTimes(50_000);
	}, 30_000);

	it("rateLimit: 10 000 waiting calls start in order, 1 000 to a window", async () => {
		const harness = createHarness();
		const order: number[] = [];
		const task = rateLimit(1000, 100, (value: number) => {
			order.push(value);
		});
		for (let index = 0; index < 10_000; index++) {
			task(index, harness.ctx() as never);
		}
		await vi.advanceTimersByTimeAsync(1000);

		expect(order).toHaveLength(10_000);
		expect(order.every((value, index) => value === index)).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	}, 30_000);

	it("rateLimit: 5 000 keys, each with its own window, leave no timer", async () => {
		const harness = createHarness();
		const handler = vi.fn((value: number) => value);
		const task = rateLimit(1, 100, handler, { key: (value) => value });
		for (let index = 0; index < 5_000; index++) {
			task(index, harness.ctx() as never);
		}
		await vi.advanceTimersByTimeAsync(100);

		expect(handler).toHaveBeenCalledTimes(5_000);
		expect(vi.getTimerCount()).toBe(0);
	}, 30_000);

	it("batch: 50 000 payloads in one window go to the handler as one array", async () => {
		const harness = createHarness();
		const handler = vi.fn((_values: number[]) => 1);
		const task = batch(100, handler);
		for (let index = 0; index < 50_000; index++) {
			task(index, harness.ctx() as never);
		}
		await vi.advanceTimersByTimeAsync(100);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0]?.[0]).toHaveLength(50_000);
		expect(vi.getTimerCount()).toBe(0);
	}, 30_000);

	it("batch: 20 000 keys, a batch of one for each, leave no timer", async () => {
		const harness = createHarness();
		const handler = vi.fn((_values: number[]) => 1);
		const task = batch(100, handler, { key: (value) => value });
		for (let index = 0; index < 20_000; index++) {
			task(index, harness.ctx() as never);
		}
		await vi.advanceTimersByTimeAsync(100);

		expect(handler).toHaveBeenCalledTimes(20_000);
		expect(vi.getTimerCount()).toBe(0);
	}, 30_000);

	it("batch: 5 000 callers aborted while collecting leave an empty batch and no timer", async () => {
		const harness = createHarness();
		const handler = vi.fn();
		const task = batch(100, handler);
		const contexts = Array.from({ length: 5_000 }, () => harness.ctx());
		for (const ctx of contexts) {
			task(1, ctx as never);
		}
		for (const ctx of contexts) {
			ctx.abort();
		}
		await vi.advanceTimersByTimeAsync(200);

		expect(handler).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	}, 30_000);
});
