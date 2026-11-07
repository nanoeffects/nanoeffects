// Random shapes of the calls of `all` and `allSettled`: every kind of first argument (a task
// context, an AbortController, `{ signal }`, `{}`, effects as an object, as an array, an object with
// a starter named `signal`) with every kind of second one. The rule is written out here, apart from
// the code: a context is not an array and has an object `signal` or no function value; two
// arguments with anything else first are effects and options. A context form returns a promise with
// the values, a short form returns a function that gives the same values when a group calls it.
import { describe, expect, it } from "vitest";
import { all, allSettled } from "../effects";
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

type Effects = Record<string, () => number> | Array<() => number>;
type Options = { concurrency?: number } | null | undefined;

const effectsOf = (random: () => number, size: number) => {
	const kind = Math.floor(random() * 3);
	const starters = Array.from({ length: size }, (_, index) => () => index);
	if (kind === 0) {
		return starters;
	}
	const entries = starters.map((starter, index) => [
		kind === 2 && index === 0 ? "signal" : `key${index}`,
		starter,
	]);

	return Object.fromEntries(entries) as Record<string, () => number>;
};

const valuesOf = (effects: Effects): unknown =>
	Array.isArray(effects)
		? effects.map((starter) => starter())
		: Object.fromEntries(
				Object.entries(effects).map(([key, starter]) => [key, starter()]),
			);

const settle = (values: unknown): unknown => {
	const wrap = (value: unknown) => ({ status: "fulfilled", value });
	if (Array.isArray(values)) {
		return values.map(wrap);
	}

	return Object.fromEntries(
		Object.entries(values as object).map(([key, value]) => [key, wrap(value)]),
	);
};

describe("call shapes of all and allSettled", () => {
	for (const [name, group, expected] of [
		["all", all, (values: unknown) => values],
		["allSettled", allSettled, settle],
	] as const) {
		it(`${name}: the first argument tells the form`, async () => {
			for (let seed = 1; seed <= SEEDS; seed++) {
				const random = mulberry32(seed);
				const effects = effectsOf(random, 1 + Math.floor(random() * 4));
				const want = expected(valuesOf(effects));
				const harness = createHarness();
				const group2 = group as unknown as (...args: unknown[]) => unknown;
				const contexts = [
					harness.ctx(),
					new AbortController(),
					{ signal: new AbortController().signal },
					{},
				];
				const context = contexts[Math.floor(random() * contexts.length)];
				const optionsList: Options[] = [
					void 0,
					null,
					{},
					{ concurrency: 1 + Math.floor(random() * 4) },
					{ concurrency: Number.POSITIVE_INFINITY },
				];
				const options = optionsList[Math.floor(random() * optionsList.length)];

				// the old rule: a context first and the effects second is the ctx form
				const direct = group2(context, effects);
				expect(direct).toBeInstanceOf(Promise);
				expect(await direct).toEqual(want);

				// three arguments are the ctx form too
				const limited = group2(context, effects, options);
				expect(limited).toBeInstanceOf(Promise);
				expect(await limited).toEqual(want);

				// effects first: a short form, whatever the options are
				const short =
					random() < 0.5 ? group2(effects) : group2(effects, options);
				expect(typeof short).toBe("function");
				const child = harness.ctx();
				const viaGroup = (short as (child: unknown) => Promise<unknown>)(child);
				expect(await viaGroup).toEqual(want);
			}
		});
	}
});
