import { describe, expect, it } from "vitest";
// @ts-expect-error a plain JavaScript helper of the examples
import { requestsThatKeptRunning } from "../../examples/lint/prove-cancel.js";
import { createBus } from "../core/bus";
import { latest } from "../policies";

// The helper of examples/lint/prove-cancel.js finds what a linter cannot: a function that gets the signal and ignores it.

type Kept = { step: number; url: string; hadSignal: boolean };
type Run = (start: (value: string) => void) => Promise<Kept[]>;
const run = requestsThatKeptRunning as Run;

// an api layer: one function forwards the signal to fetch, one is given it and ignores it, one takes none
const api = {
	forwards: (query: string, options: { signal?: AbortSignal } = {}) =>
		fetch(
			`/forwards?q=${query}`,
			options.signal ? { signal: options.signal } : {},
		),
	ignores: (query: string, _options: { signal?: AbortSignal } = {}) =>
		fetch(`/ignores?q=${query}`),
	takesNone: (query: string) => fetch(`/none?q=${query}`),
};

const busWith = (
	handler: (query: string, ctx: { signal: AbortSignal }) => Promise<unknown>,
) => {
	const bus = createBus<Record<string, string>>({ onError: () => {} });
	bus.on("search", latest(handler as never));

	return (value: string) => bus.emit("search", value);
};

describe("requestsThatKeptRunning", () => {
	it("finds nothing for a handler whose every step forwards the signal", async () => {
		const start = busWith(async (query, ctx) => {
			await api.forwards(`${query}1`, { signal: ctx.signal });
			await api.forwards(`${query}2`, { signal: ctx.signal });
			await api.forwards(`${query}3`, { signal: ctx.signal });
		});

		expect(await run(start)).toEqual([]);
	});

	it("finds a request that the linter accepts: the signal is passed and the api ignores it", async () => {
		const start = busWith(async (query, ctx) => {
			await api.forwards(`${query}1`, { signal: ctx.signal });
			await api.ignores(`${query}2`, { signal: ctx.signal });
		});

		const kept = await run(start);

		expect(kept.map((request) => request.url.split("?")[0])).toEqual([
			"/ignores",
		]);
		expect(kept[0]?.hadSignal).toBe(false);
	});

	it("finds a step that gets no signal at all, at the step where it runs", async () => {
		const start = busWith(async (query, ctx) => {
			await api.forwards(`${query}1`, { signal: ctx.signal });
			await api.forwards(`${query}2`, { signal: ctx.signal });
			await api.takesNone(`${query}3`);
		});

		const kept = await run(start);

		expect(kept).toHaveLength(1);
		expect(kept[0]?.step).toBe(2);
	});

	it("finds a request with a signal that is not the handler's", async () => {
		const start = busWith(async (query) => {
			await fetch(`/own?q=${query}`, { signal: new AbortController().signal });
		});

		const kept = await run(start);

		expect(kept).toHaveLength(1);
		expect(kept[0]?.hadSignal).toBe(true);
	});

	it("accepts a signal joined with another", async () => {
		const start = busWith(async (query, ctx) => {
			await fetch(`/joined?q=${query}`, {
				signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)]),
			});
		});

		expect(await run(start)).toEqual([]);
	});

	it("restores fetch when it is done", async () => {
		const before = globalThis.fetch;

		await run(busWith(async () => {}));

		expect(globalThis.fetch).toBe(before);
	});
});
