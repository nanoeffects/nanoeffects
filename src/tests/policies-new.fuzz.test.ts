// Random mixes of dedupe, distinct, rateLimit and batch, alone and wrapped in the
// older policies, with random delays, errors and aborts. Whatever happens, every
// call settles, each policy keeps its own promise, the job around a policy hears
// of each run once, the trace stays consistent and nothing is left running.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionsPlugin, createJob } from "../actions";
import { type Context, createBus } from "../core/bus";
import type { Task, TraceEvent } from "../core/types";
import { delay } from "../effects";
import {
	batch,
	debounce,
	dedupe,
	distinct,
	latest,
	leading,
	queue,
	rateLimit,
	throttle,
} from "../policies";
import { signalPlugin } from "../signal";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";

type Events = Record<string, number>;

const SEEDS = 300;

const mulberry32 = (seed: number) => {
	let first = seed;
	return () => {
		first = (first + 0x6d2b79f5) | 0;
		let mixed = Math.imul(first ^ (first >>> 15), 1 | first);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
};

type Call = {
	name: string;
	payload: number;
	settled: boolean;
	outcome?: "value" | "undefined" | "error" | "sync";
};

// the start times of every run of a rateLimit, to check the window afterwards
type Window = {
	limit: number;
	ms: number;
	key: (payload: number) => number;
	starts: { key: number; at: number; seq: number }[];
};

const simulate = async (seed: number) => {
	const random = mulberry32(seed);
	const int = (max: number) => Math.floor(random() * max);

	const recorder = createTraceRecorder();
	const bus = createBus<Events>({
		trace: createTracer(recorder),
		onError: () => {},
	});

	const held: Context<Events>[] = [];
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

	// ---- instrumented handlers: they say what they run, and fail now and then
	const flaky = () => random() < 0.12;
	// now and then a handler that ignores its signal, as real code does: the abort must still be enough
	const sleep = (ctx: Context<Events>) => {
		const ms = 5 + int(40);
		if (random() < 0.3) {
			return new Promise<void>((resolve) => {
				setTimeout(resolve, ms);
			});
		}

		return delay(ctx, ms);
	};

	// dedupe: at most one run per key may be alive: not settled, not aborted
	// (the signal tells it at once, whatever the order of the abort listeners)
	type DedupeRun = { signal: AbortSignal; settled: boolean };
	const runsOf = new Map<number, DedupeRun[]>();
	const dedupeBreaks: string[] = [];
	const dedupeWork: Task<number, Events, Promise<number>> = async (
		payload,
		ctx,
	) => {
		const runs = runsOf.get(payload) ?? [];
		runsOf.set(payload, runs);
		const live = runs.filter((run) => !(run.settled || run.signal.aborted));
		if (live.length > 0) {
			dedupeBreaks.push(`key ${payload} already has a live run`);
		}
		const mine: DedupeRun = { signal: ctx.signal, settled: false };
		runs.push(mine);
		try {
			await sleep(ctx);
			if (flaky()) {
				throw new Error("flaky");
			}
			return payload;
		} finally {
			mine.settled = true;
		}
	};

	// distinct: the reference model of what is remembered, kept by hand. A run is told apart
	// by a token, not by its payload: an older run of the same payload must not clear a newer one.
	type Token = { payload: number };
	const remembered = new Map<number, Token | null>();
	const distinctBreaks: string[] = [];
	const distinctWork: Task<number, Events, Promise<number>> = async (
		payload,
		ctx,
	) => {
		const key = payload % 3;
		if (remembered.get(key)?.payload === payload) {
			distinctBreaks.push(`ran ${payload}, which is remembered for ${key}`);
		}
		const token: Token = { payload };
		remembered.set(key, token);
		const forget = () => {
			if (remembered.get(key) === token) {
				remembered.set(key, null);
			}
		};
		ctx.signal.addEventListener("abort", forget);
		try {
			await sleep(ctx);
			if (flaky()) {
				throw new Error("flaky");
			}
			return payload;
		} catch (error) {
			forget();
			throw error;
		} finally {
			// an abort after the run resolved does not make the policy forget it
			ctx.signal.removeEventListener("abort", forget);
		}
	};

	// the order of the calls, to see that calls that wait start in that order
	const sequenceOf = new WeakMap<object, number>();
	let sequence = 0;
	const windows: Window[] = [];
	const limitedWork =
		(window: Window): Task<number, Events, Promise<number>> =>
		async (payload, ctx) => {
			window.starts.push({
				key: window.key(payload),
				at: Date.now(),
				seq: sequenceOf.get(ctx) ?? -1,
			});
			await sleep(ctx);
			if (flaky()) {
				throw new Error("flaky");
			}
			return payload;
		};

	// batch: every payload goes to the handler at most once, in a batch of the allowed size
	const sent: number[] = [];
	const batchBreaks: string[] = [];
	// payloads of a batch whose owner aborted while it ran: nobody may get a value for them
	const orphaned = new Set<number>();
	const batchWork =
		(maxSize: number): Task<number[], Events, Promise<number>> =>
		async (payloads, ctx) => {
			if (payloads.length > maxSize) {
				batchBreaks.push(`a batch of ${payloads.length}, over ${maxSize}`);
			}
			if (payloads.length === 0) {
				batchBreaks.push("an empty batch");
			}
			sent.push(...payloads);
			try {
				await sleep(ctx);
			} catch (error) {
				for (const payload of payloads) {
					orphaned.add(payload);
				}
				throw error;
			}
			if (ctx.signal.aborted) {
				for (const payload of payloads) {
					orphaned.add(payload);
				}
			}
			if (flaky()) {
				throw new Error("flaky");
			}
			return payloads.length;
		};

	const plainWork: Task<number, Events, Promise<number>> = async (
		payload,
		ctx,
	) => {
		await sleep(ctx);
		if (flaky()) {
			throw new Error("flaky");
		}
		return payload;
	};

	const rateOne: Window = { limit: 3, ms: 50, key: () => 0, starts: [] };
	const rateKeyed: Window = {
		limit: 2,
		ms: 40,
		key: (payload) => payload % 2,
		starts: [],
	};
	// only the windows whose handler starts right when the policy lets it are checked
	windows.push(rateOne, rateKeyed);
	// a counter for a batch payload, so each payload is told apart
	let unique = 1000;

	type Entry = { name: string; call: Task<number, Events, unknown> };
	const entries: Entry[] = [
		{ name: "dedupe", call: dedupe(dedupeWork) },
		{ name: "distinct", call: distinct(distinctWork, { key: (p) => p % 3 }) },
		{ name: "rateLimit", call: rateLimit(3, 50, limitedWork(rateOne)) },
		{
			name: "rateLimitKeyed",
			call: rateLimit(2, 40, limitedWork(rateKeyed), { key: (p) => p % 2 }),
		},
		{
			name: "rateLimitDrop",
			call: rateLimit(1, 30, plainWork, { overflow: "drop" }),
		},
		{ name: "batch", call: batch(30, batchWork(Number.POSITIVE_INFINITY)) },
		{ name: "batchMax", call: batch(30, batchWork(4), { maxSize: 4 }) },
		{
			name: "batchKeyed",
			call: batch(25, batchWork(3), { key: (p) => p % 2, maxSize: 3 }),
		},
		// compositions
		{ name: "queue(dedupe)", call: queue(dedupe(plainWork)) },
		{ name: "dedupe(queue)", call: dedupe(queue(plainWork)) },
		{ name: "latest(dedupe)", call: latest(dedupe(plainWork)) },
		{ name: "dedupe(latest)", call: dedupe(latest(plainWork)) },
		{ name: "leading(dedupe)", call: leading(dedupe(plainWork)) },
		{ name: "debounce(dedupe)", call: debounce(20, dedupe(plainWork)) },
		{ name: "throttle(distinct)", call: throttle(25, distinct(plainWork)) },
		{
			name: "rateLimit(queue)",
			call: rateLimit(2, 30, queue(plainWork, { concurrency: 2 })),
		},
		{ name: "queue(rateLimit)", call: queue(rateLimit(2, 30, plainWork)) },
		{ name: "latest(rateLimit)", call: latest(rateLimit(1, 30, plainWork)) },
		{ name: "distinct(dedupe)", call: distinct(dedupe(plainWork)) },
		{ name: "dedupe(distinct)", call: dedupe(distinct(plainWork)) },
		{ name: "latest(batch)", call: latest(batch(30, batchWork(9))) },
		{ name: "queue(batch)", call: queue(batch(30, batchWork(9))) },
		{
			name: "batch(latest)",
			call: batch(
				30,
				latest(async (payloads: number[], ctx) => {
					sent.push(...payloads);
					await sleep(ctx);
					return payloads.length;
				}),
			),
		},
		{
			name: "batch(queue)",
			call: batch(
				30,
				queue(async (payloads: number[], ctx) => {
					sent.push(...payloads);
					await sleep(ctx);
					return payloads.length;
				}),
			),
		},
		{
			name: "rateLimit(batch)",
			call: rateLimit(2, 40, batch(20, batchWork(9))),
		},
		{
			name: "batch(rateLimit)",
			call: batch(
				20,
				rateLimit(1, 30, async (payloads: number[], ctx) => {
					sent.push(...payloads);
					await sleep(ctx);
					return payloads.length;
				}),
			),
		},
	];

	const calls: Call[] = [];
	const track = (name: string, payload: number, result: unknown) => {
		const record: Call = { name, payload, settled: false };
		calls.push(record);
		if (!(result instanceof Promise)) {
			record.settled = true;
			record.outcome = result === void 0 ? "sync" : "value";
			return;
		}
		result.then(
			(value) => {
				record.settled = true;
				record.outcome = value === void 0 ? "undefined" : "value";
			},
			() => {
				record.settled = true;
				record.outcome = "error";
			},
		);
	};

	const callOf = (name: string) => {
		const entry = entries.find((candidate) => candidate.name === name);
		if (!entry) {
			throw new Error(`no policy ${name}`);
		}
		return entry;
	};

	// the distinct model also has to see skipped calls: a skip is right only for a remembered payload
	const distinctSkips: string[] = [];

	// a few policies get all the traffic, so that calls overlap often
	const crowd = entries.filter(() => random() < 0.1);
	const used =
		crowd.length > 0 ? crowd : [callOf("rateLimit"), callOf("batch")];

	const steps = 300 + int(300);
	for (let step = 0; step < steps; step++) {
		const pick = int(used.length + 2);
		const entry = used[pick];
		if (entry) {
			const ctx = freshCtx();
			const batchLike = entry.name.includes("batch");
			const payload = batchLike ? ++unique : int(6);
			const before = remembered.get(payload % 3)?.payload;
			sequenceOf.set(ctx, sequence++);
			const result = entry.call(payload, ctx);
			if (entry.name === "distinct") {
			}
			if (
				entry.name === "distinct" &&
				result === void 0 &&
				before !== payload
			) {
				distinctSkips.push(`skipped ${payload}, remembered ${before}`);
			}
			track(entry.name, payload, result);
		} else {
			// abort a random context that is still held
			// mostly a context that is still fresh, where a call is likely to be waiting
			const recent = random() < 0.7 ? Math.min(held.length, 8) : held.length;
			held[held.length - 1 - int(Math.max(recent, 1))]?.abort("fuzz");
		}
		await vi.advanceTimersByTimeAsync(int(10));
	}

	for (const ctx of held) {
		ctx.abort("end");
	}
	await vi.advanceTimersByTimeAsync(60_000);

	return {
		events: recorder.events,
		calls,
		windows,
		sent,
		orphaned,
		timers: vi.getTimerCount(),
		dedupeBreaks,
		distinctBreaks,
		distinctSkips,
		batchBreaks,
		callOf,
		used: used.map((entry) => entry.name).join(", "),
	};
};

const checkTrace = (events: TraceEvent[]) => {
	// a task wrapped in two policies is reported by each of them, so the unit is a task and an effect
	const byId = new Map<string, TraceEvent[]>();
	for (const event of events) {
		const key = `${event.id}/${event.effect}`;
		byId.set(key, [...(byId.get(key) ?? []), event]);
	}

	for (const [id, own] of byId) {
		const phases = own.map((event) => event.phase);
		const starts = phases.filter((phase) => phase === "start").length;
		const ends = phases.filter((phase) => phase !== "start").length;

		expect(starts, `task ${id} starts`).toBeLessThanOrEqual(1);
		expect(ends, `task ${id} ends (${phases.join(",")})`).toBe(1);
		expect(phases.at(-1), `task ${id} last phase`).not.toBe("start");
		if (starts === 0) {
			expect(phases, `task ${id} never started`).toEqual(["drop"]);
		}
	}
};

const checkWindow = ({ limit, ms, starts }: Window) => {
	const lastSequence = new Map<number, number>();
	for (const start of starts) {
		const before = lastSequence.get(start.key) ?? -1;
		expect(start.seq, `order of starts of key ${start.key}`).toBeGreaterThan(
			before,
		);
		lastSequence.set(start.key, start.seq);
	}

	for (const [index, start] of starts.entries()) {
		let inWindow = 0;
		for (const other of starts.slice(0, index + 1)) {
			if (
				other.key === start.key &&
				other.at > start.at - ms &&
				other.at <= start.at
			) {
				inWindow++;
			}
		}
		expect(
			inWindow,
			`starts of key ${start.key} in the window ending at ${start.at}`,
		).toBeLessThanOrEqual(limit);
	}
};

describe("fuzz: the newer policies alone and composed, with random aborts", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.each(Array.from({ length: SEEDS }, (_, index) => index + 1))(
		"seed %i",
		async (seed) => {
			const result = await simulate(seed);

			expect(result.timers, "timers left").toBe(0);
			checkTrace(result.events);
			for (const call of result.calls) {
				expect(call.settled, `${call.name}(${call.payload}) settled`).toBe(
					true,
				);
			}
			expect(result.dedupeBreaks, result.used).toEqual([]);
			expect(result.distinctBreaks, result.used).toEqual([]);
			expect(result.distinctSkips, result.used).toEqual([]);
			expect(result.batchBreaks, result.used).toEqual([]);
			expect(new Set(result.sent).size, "a payload sent twice").toBe(
				result.sent.length,
			);
			for (const call of result.calls) {
				if (
					call.name.startsWith("batch") &&
					result.orphaned.has(call.payload)
				) {
					expect(
						call.outcome,
						`${call.name}(${call.payload}) of an aborted run`,
					).not.toBe("value");
				}
			}
			for (const window of result.windows) {
				checkWindow(window);
			}
		},
	);

	it("conserves the payloads of batch: a call that got a value was sent once", async () => {
		for (let seed = 1; seed <= 60; seed++) {
			const { calls, sent } = await simulate(seed);
			const counts = new Map<number, number>();
			for (const value of sent) {
				counts.set(value, (counts.get(value) ?? 0) + 1);
			}
			for (const call of calls) {
				if (call.name === "batch" && call.outcome === "value") {
					expect(counts.get(call.payload), `payload ${call.payload}`).toBe(1);
				}
			}
		}
	});
});

// ---- the job around a policy hears of each run once

const jobSeeds = 150;

type Option = {
	name: string;
	policy: (
		handler: Task<number, Events, Promise<number>>,
	) => Task<number, Events, unknown>;
};

const simulateJob = async (seed: number, option: Option) => {
	const random = mulberry32(seed * 7919);
	const int = (max: number) => Math.floor(random() * max);

	const bus = createBus<Events>({ onError: () => {} }).use(signalPlugin());
	const actions = bus.use(actionsPlugin());
	const job = createJob<number, number>("work");

	let running = 0;
	let peak = 0;
	const counts = { pending: 0, success: 0, fail: 0, cancel: 0 };
	const order: string[] = [];
	const closing = ["success", "fail", "cancel"] as const;
	bus.on(job.pending, () => {
		counts.pending++;
		running++;
		order.push("pending");
	});
	for (const name of closing) {
		bus.on(job[name], () => {
			counts[name]++;
			running--;
			peak = Math.min(peak, running);
			order.push(name);
		});
	}

	let invocations = 0;
	const work: Task<number, Events, Promise<number>> = async (payload, ctx) => {
		invocations++;
		await delay(ctx, 5 + int(40));
		if (random() < 0.15) {
			throw new Error("flaky");
		}
		return payload;
	};
	actions.handle(job, option.policy(work) as never);

	const controllers: AbortController[] = [];
	const results: Promise<unknown>[] = [];
	const steps = 40 + int(60);
	for (let step = 0; step < steps; step++) {
		if (int(5) === 0 && controllers.length > 0) {
			controllers[int(controllers.length)]?.abort("fuzz");
		} else {
			const controller = new AbortController();
			controllers.push(controller);
			const result = bus.emit(
				job(int(5) + (option.name.includes("batch") ? step * 100 : 0)),
				{
					signal: controller.signal,
				},
			);
			results.push(Promise.resolve(result).catch(() => {}));
		}
		await vi.advanceTimersByTimeAsync(int(30));
	}
	for (const controller of controllers) {
		controller.abort("end");
	}
	await vi.advanceTimersByTimeAsync(60_000);

	return {
		counts,
		order,
		running,
		peak,
		invocations,
		timers: vi.getTimerCount(),
	};
};

const options: Option[] = [
	{ name: "dedupe", policy: (handler) => dedupe(handler) },
	{ name: "distinct", policy: (handler) => distinct(handler) },
	{ name: "rateLimit", policy: (handler) => rateLimit(2, 40, handler) },
	{
		name: "rateLimit drop",
		policy: (handler) => rateLimit(1, 40, handler, { overflow: "drop" }),
	},
	{
		name: "batch",
		policy: (handler) =>
			batch(30, async (payloads: number[], ctx) => {
				await handler(payloads[0] ?? 0, ctx);
				return payloads.length;
			}),
	},
	{ name: "queue(dedupe)", policy: (handler) => queue(dedupe(handler)) },
	{ name: "dedupe(latest)", policy: (handler) => dedupe(latest(handler)) },
	{
		name: "latest(rateLimit)",
		policy: (handler) => latest(rateLimit(1, 30, handler)),
	},
];

describe("fuzz: a job around the newer policies", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	for (const option of options) {
		it.each(Array.from({ length: jobSeeds }, (_, index) => index + 1))(
			`${option.name}: seed %i`,
			async (seed) => {
				const result = await simulateJob(seed, option);

				// every pending has exactly one closing outcome, and none comes without it
				expect(result.running, "calls left open").toBe(0);
				expect(result.peak, "a closing outcome without a pending").toBe(0);
				expect(result.counts.pending).toBe(
					result.counts.success + result.counts.fail + result.counts.cancel,
				);
				expect(result.timers, "timers left").toBe(0);
				if (
					!option.name.includes("batch") &&
					!option.name.includes("queue") &&
					!option.name.includes("latest")
				) {
					// a policy that starts the handler tells the job once for each start
					expect(result.counts.pending, "pending for each run").toBe(
						result.invocations,
					);
				}
			},
		);
	}
});
