// Random lists of steps with random failures, delays, steps that ignore their
// signal, strategies on the steps and on the options, and an abort at a random
// moment, against a plain model of the rollback. Whatever happens, a rollback
// runs at most once and exactly for the finished steps that the strategy picks,
// no step starts after an abort, the result settles after the last rollback,
// and nothing is left held.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type RollbackFailure,
	type RollbackOn,
	type RollbackOrder,
	transaction,
} from "../effects";
import { createHarness } from "./test-helpers";

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

const ONS: ReadonlyArray<RollbackOn | null | undefined> = [
	void 0,
	null,
	"both",
	"error",
	"abort",
];
const FAILURES: ReadonlyArray<RollbackFailure | null | undefined> = [
	void 0,
	null,
	"continue",
	"stop",
];
const ORDERS: ReadonlyArray<RollbackOrder | null | undefined> = [
	void 0,
	null,
	"reverse",
	"parallel",
];

type Spec = {
	fails: boolean;
	delay: number;
	deaf: boolean;
	hasRollback: boolean;
	on: RollbackOn | null | undefined;
	failure: RollbackFailure | null | undefined;
	rollbackFails: boolean;
	rollbackDelay: number;
	error: Error;
	rollbackError: Error;
};

type Facts = {
	started: boolean;
	returned: boolean;
	abortedAtReturn: boolean;
	rejected?: { kind: "own" | "abort"; aborted: boolean; error: unknown };
};

const sleep = (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

const wants = (on: RollbackOn, trigger: "error" | "abort") =>
	on === "both" || on === trigger;

// Every time is a multiple of 10 and an abort is at 5 past one, so no timer ties with another
const simulate = async (seed: number) => {
	const random = mulberry32(seed);
	const int = (max: number) => Math.floor(random() * max);
	const pick = <T>(items: readonly T[]): T => items[int(items.length)] as T;

	const harness = createHarness();
	const ctx = harness.ctx();
	const count = int(7);
	const specs: Spec[] = Array.from({ length: count }, (_, index) => ({
		fails: random() < 0.2,
		delay: 10 * int(4),
		deaf: random() < 0.3,
		hasRollback: random() < 0.85,
		on: pick(ONS),
		failure: pick(FAILURES),
		rollbackFails: random() < 0.25,
		rollbackDelay: 10 * int(3),
		error: new Error(`step ${index}`),
		rollbackError: new Error(`rollback ${index}`),
	}));
	const options = {
		rollbackOn: pick(ONS),
		rollbackFailure: pick(FAILURES),
		rollbackOrder: pick(ORDERS),
	};
	const facts: Facts[] = specs.map(() => ({
		started: false,
		returned: false,
		abortedAtReturn: false,
	}));
	const startOrder: number[] = [];
	const violations: string[] = [];
	const calls: Array<{ index: number; at: number }> = [];
	const rollbackEnds: number[] = [];

	const steps = specs.map((spec, index) => ({
		run: ({ signal }: { signal: AbortSignal }) =>
			new Promise<number>((resolve, reject) => {
				const fact = facts[index] as Facts;
				fact.started = true;
				startOrder.push(index);
				if (ctx.signal.aborted) {
					violations.push(`step ${index} started after the abort`);
				}
				const timer = setTimeout(() => {
					if (spec.fails) {
						fact.rejected = {
							kind: "own",
							aborted: ctx.signal.aborted,
							error: spec.error,
						};
						reject(spec.error);

						return;
					}
					fact.returned = true;
					fact.abortedAtReturn = ctx.signal.aborted;
					resolve(index);
				}, spec.delay);
				if (!spec.deaf) {
					signal.addEventListener(
						"abort",
						() => {
							clearTimeout(timer);
							fact.rejected = {
								kind: "abort",
								aborted: true,
								error: signal.reason,
							};
							reject(signal.reason);
						},
						{ once: true },
					);
				}
			}),
		rollback: spec.hasRollback
			? async (value: number) => {
					calls.push({ index: value, at: Date.now() });
					await sleep(spec.rollbackDelay);
					rollbackEnds.push(Date.now());
					if (spec.rollbackFails) {
						throw spec.rollbackError;
					}
				}
			: void 0,
		rollbackOn: spec.on,
		rollbackFailure: spec.failure,
	}));

	const effectiveFailure = (spec: Spec) =>
		spec.failure ?? options.rollbackFailure ?? "continue";
	const order = options.rollbackOrder ?? "reverse";
	const mustThrow =
		order === "parallel" &&
		specs.some((spec) => effectiveFailure(spec) === "stop");

	const preAborted = random() < 0.05;
	if (preAborted) {
		ctx.abort();
	}
	const abortAt = random() < 0.5 ? 10 * int(8) + 5 : null;
	if (abortAt !== null && !preAborted) {
		setTimeout(() => ctx.abort(), abortAt);
	}

	let thrown: unknown;
	let outcome:
		| { ok: true; value: unknown }
		| { ok: false; error: unknown }
		| undefined;
	let settledAt = -1;
	try {
		// the same transaction in every call form: an array or steps as arguments, with the context or as a starter
		const form = int(4);
		const given = options;
		const loose = transaction as (...args: unknown[]) => unknown;
		const call = (): Promise<unknown> => {
			if (form === 0 || steps.length === 0) {
				return transaction(ctx, steps, options);
			}
			if (form === 1) {
				return loose(ctx, given, ...steps) as Promise<unknown>;
			}
			if (form === 2) {
				const starter = loose(given, ...steps) as (
					child: object,
				) => Promise<unknown>;

				return starter(ctx);
			}
			const starter = loose(steps, options) as (
				child: object,
			) => Promise<unknown>;

			return starter(ctx);
		};
		const result = call();
		result.then(
			(value) => {
				outcome = { ok: true, value };
				settledAt = Date.now();
			},
			(error: unknown) => {
				outcome = { ok: false, error };
				settledAt = Date.now();
			},
		);
	} catch (error) {
		thrown = error;
	}
	await vi.advanceTimersByTimeAsync(2000);

	return {
		specs,
		facts,
		options,
		order,
		mustThrow,
		thrown,
		outcome,
		settledAt,
		startOrder,
		violations,
		calls,
		rollbackEnds,
		preAborted,
		ctx,
		effectiveFailure,
	};
};

const check = async (seed: number) => {
	const run = await simulate(seed);
	const label = `seed ${seed}`;
	const { specs, facts, options, order, ctx } = run;

	if (run.mustThrow) {
		expect(run.thrown, label).toBeInstanceOf(TypeError);
		expect(run.startOrder, label).toEqual([]);

		return;
	}
	expect(run.thrown, label).toBeUndefined();
	expect(run.violations, label).toEqual([]);
	expect(run.outcome, `${label}: settled`).toBeDefined();

	// steps start one after another, in order, and none after the first one that rejected
	expect(run.startOrder, label).toEqual(
		specs.map((_, index) => index).slice(0, run.startOrder.length),
	);

	const rejectedFact = facts.find((fact) => fact.rejected);
	const abortedAfterReturn = facts.some((fact) => fact.abortedAtReturn);
	const everyReturned = facts.every((fact) => fact.returned);
	const shouldResolve =
		!run.preAborted && !rejectedFact && !abortedAfterReturn && everyReturned;

	if (shouldResolve) {
		expect(run.outcome, label).toEqual({
			ok: true,
			value: specs.map((_, index) => index),
		});
		expect(run.calls, label).toEqual([]);
	} else {
		await checkRollback(run, label);
	}

	// nothing of the transaction is still linked to the task: aborting it aborts nothing else
	if (!ctx.signal.aborted) {
		const abort = vi.spyOn(AbortController.prototype, "abort");
		ctx.abort();
		expect(abort, `${label}: still linked to the task`).toHaveBeenCalledTimes(
			1,
		);
		abort.mockRestore();
	}
	expect(vi.getTimerCount(), `${label}: timers`).toBe(0);
	// the options of the run are only used above through the model
	expect(order, label).toBe(options.rollbackOrder ?? "reverse");
};

const checkRollback = async (
	run: Awaited<ReturnType<typeof simulate>>,
	label: string,
) => {
	const { specs, facts, options, order, ctx } = run;
	const rejected = facts.map((fact) => fact.rejected).find(Boolean);
	const trigger =
		rejected && rejected.kind === "own" && !rejected.aborted
			? "error"
			: "abort";
	const original = rejected ? rejected.error : ctx.signal.reason;

	const finished = facts.flatMap((fact, index) =>
		fact.returned ? [index] : [],
	);
	const chosen = finished.filter((index) => {
		const spec = specs[index] as Spec;

		return (
			spec.hasRollback &&
			wants(spec.on ?? options.rollbackOn ?? "both", trigger)
		);
	});

	let expectedCalls = [...chosen];
	let expectedFailures: Error[] = [];
	if (order === "reverse") {
		expectedCalls = [];
		for (const index of [...chosen].reverse()) {
			const spec = specs[index] as Spec;
			expectedCalls.push(index);
			if (spec.rollbackFails) {
				expectedFailures.push(spec.rollbackError);
				if (run.effectiveFailure(spec) === "stop") {
					break;
				}
			}
		}
	} else {
		expectedFailures = chosen.flatMap((index) => {
			const spec = specs[index] as Spec;

			return spec.rollbackFails ? [spec.rollbackError] : [];
		});
	}

	const calledIndexes = run.calls.map((call) => call.index);
	if (order === "reverse") {
		expect(calledIndexes, `${label}: reverse calls`).toEqual(expectedCalls);
	} else {
		expect([...calledIndexes].sort(), `${label}: parallel calls`).toEqual(
			[...expectedCalls].sort(),
		);
		expect(
			new Set(run.calls.map((call) => call.at)).size,
			label,
		).toBeLessThanOrEqual(1);
	}
	expect(new Set(calledIndexes).size, `${label}: once each`).toBe(
		calledIndexes.length,
	);

	// the result settles after the last rollback
	const lastEnd = Math.max(-1, ...run.rollbackEnds);
	expect(run.settledAt, `${label}: after rollback`).toBeGreaterThanOrEqual(
		lastEnd,
	);

	expect(run.outcome?.ok, label).toBe(false);
	const error = run.outcome && !run.outcome.ok ? run.outcome.error : void 0;
	if (expectedFailures.length === 0) {
		expect(error, `${label}: original error`).toBe(original);
		return;
	}
	expect(error, label).toBeInstanceOf(AggregateError);
	const [first, ...rest] = (error as AggregateError).errors;
	expect(first, label).toBe(original);
	const messages = (items: unknown[]) =>
		items.map((item) => (item as Error).message).sort();
	expect(messages(rest), label).toEqual(messages(expectedFailures));
};

describe("transaction (fuzz)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it(`matches a plain model of the rollback over ${SEEDS} random runs`, async () => {
		for (let seed = 1; seed <= SEEDS; seed++) {
			await check(seed);
		}
	});
});
