// Random mixes of policies and effects with random aborts. Whatever happens,
// the trace must stay consistent and nothing may be left running.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Context, createBus } from "../core/bus";
import type { Task, TraceEvent } from "../core/types";
import {
	all,
	allSettled,
	delay,
	poll,
	race,
	retry,
	take,
	timeout,
} from "../effects";
import { debounce, latest, leading, queue, throttle } from "../policies";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";

type Events = {
	l: number;
	d: number;
	th: number;
	le: number;
	q: number;
	qa: number;
	qd: number;
	lk: number;
	dl: number;
	tl: number;
	qk: number;
	lea: number;
	tk: string;
	cx: number;
};

const task = <P, R>(handler: Task<P, Events, R>) => handler;

const mulberry32 = (seed: number) => {
	let first = seed;
	return () => {
		first = (first + 0x6d2b79f5) | 0;
		let mixed = Math.imul(first ^ (first >>> 15), 1 | first);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
};

const simulate = async (seed: number) => {
	const random = mulberry32(seed);
	const int = (max: number) => Math.floor(random() * max);

	const recorder = createTraceRecorder<Events>();
	// handlers fail now and then; the errors are not the point here
	const bus = createBus<Events>({
		trace: createTracer(recorder),
		onError: () => {},
	});
	const peaks = { q: 0, le: 0 };
	const running = { q: 0, le: 0 };

	const timed = (name: "q" | "le") =>
		task(async (_: number, ctx: Context<Events>) => {
			running[name]++;
			peaks[name] = Math.max(peaks[name], running[name]);
			try {
				await delay(ctx, 5 + int(40));
			} finally {
				running[name]--;
			}
		});
	const work = task(async (_: number, ctx: Context<Events>) => {
		await delay(ctx, 5 + int(40));
		if (random() < 0.12) {
			throw new Error("flaky work");
		}
	});

	const held: Context<Events>[] = [];
	// also keeps the root context of a handler call, so a later step can abort it
	const tracked = <P, R>(handler: Task<P, Events, R>): Task<P, Events, R> => {
		return (payload, ctx) => {
			held.push(ctx);
			return handler(payload, ctx);
		};
	};

	bus.on("l", tracked(latest(work)));
	bus.on("d", tracked(debounce(15, work)));
	bus.on("th", tracked(throttle(25, work)));
	// not tracked, so never aborted: their concurrency can be checked
	bus.on("le", leading(timed("le")));
	bus.on("q", queue(timed("q"), { concurrency: 2 }));
	// tracked: an abort frees the slot while the old run winds down
	bus.on("lea", tracked(leading(work)));
	bus.on("qa", tracked(queue(work, { concurrency: 2 })));
	bus.on("qd", tracked(queue(work, { limit: 1, overflow: "drop-old" })));
	// keyed, and with leading/trailing options
	bus.on("lk", tracked(latest(work, { key: (value) => value % 3 })));
	bus.on("dl", tracked(debounce(15, work, { leading: true })));
	bus.on("tl", tracked(throttle(25, work, { leading: false })));
	bus.on("qk", tracked(queue(work, { key: (value) => value % 2 })));

	bus.on("cx", (_, ctx) => {
		held.push(ctx);
	});
	const freshCtx = () => {
		bus.emit("cx", 0);
		const ctx = held.at(-1);
		if (!ctx) {
			throw new Error("no context");
		}
		return ctx;
	};
	const swallow = (promise: Promise<unknown>) => promise.catch(() => {});

	const steps = 40 + int(40);
	for (let index2 = 0; index2 < steps; index2++) {
		switch (int(20)) {
			case 0:
				bus.emit("l", index2);
				break;
			case 1:
				bus.emit("d", index2);
				break;
			case 2:
				bus.emit("th", index2);
				break;
			case 3:
				bus.emit("le", index2);
				break;
			case 4:
				bus.emit("q", index2);
				break;
			case 5:
				swallow(
					all(freshCtx(), {
						a: ({ signal }) => delay({ signal }, 5 + int(30)),
						b: ({ signal }) =>
							random() < 0.2
								? Promise.reject(new Error("flaky"))
								: delay({ signal }, 5 + int(30)),
					}),
				);
				break;
			case 6:
				swallow(
					race(freshCtx(), {
						a: ({ signal }) => delay({ signal }, 5 + int(30)),
						b: ({ signal }) =>
							random() < 0.2
								? Promise.reject(new Error("flaky"))
								: delay({ signal }, 5 + int(30)),
					}),
				);
				break;
			case 7: {
				const ctx = freshCtx();
				swallow(
					retry(
						ctx,
						() =>
							random() < 0.6
								? Promise.reject(new Error("flaky"))
								: delay(ctx, 5),
						{ times: 3, delay: 10 },
					),
				);
				break;
			}
			case 8:
				swallow(
					timeout(freshCtx(), 25, ({ signal }) =>
						delay({ signal }, 5 + int(50)),
					),
				);
				break;
			case 9:
				swallow(poll(freshCtx(), () => {}, 10 + int(20)));
				break;
			case 10:
				swallow(take(freshCtx(), "tk"));
				break;
			case 11:
				bus.emit("tk", String(index2));
				break;
			case 12:
				bus.emit("lea", index2);
				break;
			case 14:
				bus.emit("lk", index2);
				break;
			case 15:
				bus.emit("dl", index2);
				break;
			case 16:
				bus.emit("tl", index2);
				break;
			case 17:
				bus.emit("qk", index2);
				break;
			case 18:
				swallow(
					allSettled(freshCtx(), {
						a: ({ signal }) => delay({ signal }, 5 + int(30)),
						b: () => Promise.reject(new Error("flaky")),
					}),
				);
				break;
			case 13:
				for (let index = 0; index < 3; index++) {
					bus.emit("qa", index2);
					bus.emit("qd", index2);
				}
				break;
			default:
				held[int(Math.max(held.length, 1))]?.abort("fuzz");
		}
		await vi.advanceTimersByTimeAsync(int(30));
	}

	for (const ctx of held) {
		ctx.abort("end");
	}
	await vi.advanceTimersByTimeAsync(30_000);

	return { events: recorder.events, peaks, timers: vi.getTimerCount() };
};

const check = (events: TraceEvent<Events>[]) => {
	const byId = new Map<number, TraceEvent<Events>[]>();
	const firstAt = new Map<number, number>();
	for (const [index, event] of events.entries()) {
		byId.set(event.id, [...(byId.get(event.id) ?? []), event]);
		if (!firstAt.has(event.id)) {
			firstAt.set(event.id, index);
		}
	}

	for (const [id, own] of byId) {
		const phases = own.map((event) => event.phase);
		const starts = phases.filter((phase) => phase === "start").length;
		const ends = phases.filter((phase) => phase !== "start").length;

		// a task starts at most once and ends exactly once, and nothing follows its end
		expect(starts, `task ${id} starts`).toBeLessThanOrEqual(1);
		expect(ends, `task ${id} ends`).toBe(1);
		expect(phases.at(-1), `task ${id} last phase`).not.toBe("start");
		if (starts === 0) {
			expect(phases, `task ${id} never started`).toEqual(["drop"]);
		}

		// a task is reported only after its parent started
		const own0 = firstAt.get(id) ?? 0;
		for (const event of own) {
			const parentAt =
				typeof event.parent === "number" ? firstAt.get(event.parent) : null;
			if (typeof parentAt === "number") {
				expect(parentAt, `task ${id} before its parent`).toBeLessThan(own0);
			}
		}
	}
};

describe("fuzz: random policies and effects with random aborts", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.each(Array.from({ length: 150 }, (_, index) => index + 1))(
		"seed %i",
		async (seed) => {
			const { events, peaks, timers } = await simulate(seed);

			check(events);
			expect(peaks.q, "queue concurrency").toBeLessThanOrEqual(2);
			expect(peaks.le, "leading concurrency").toBeLessThanOrEqual(1);
			expect(timers, "timers left").toBe(0);
		},
	);

	it("reaches the interesting branches of every policy and effect", async () => {
		const seen = new Set<string>();
		for (let seed = 1; seed <= 150; seed++) {
			const { events } = await simulate(seed);
			for (const error of events) {
				seen.add(`${error.effect}/${error.phase}`);
			}
		}

		for (const key of [
			"all/cancel",
			"all/error",
			"debounce/cancel",
			"debounce/drop",
			"latest/cancel",
			"latest/error",
			"leading/cancel",
			"leading/drop",
			"leading/error",
			"poll/cancel",
			"queue/cancel",
			"queue/drop",
			"queue/error",
			"race/cancel",
			"race/error",
			"retry/error",
			"take/cancel",
			"throttle/cancel",
			"throttle/error",
			"timeout/error",
		]) {
			expect(seen, key).toContain(key);
		}
	});
});
