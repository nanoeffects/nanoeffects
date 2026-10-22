import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createFakeApi,
	type Item,
	type RequestEvent,
} from "../../examples/playground/fake-api";
import { createBus } from "../index";
import { debounce, latest } from "../policies";

const read = (path: string) =>
	readFileSync(new URL(`../../examples/${path}`, import.meta.url), "utf8");

// the handler wiring, from `bus.on("typed"` to its closing `);`
const wiring = (source: string) => {
	const start = source.indexOf('bus.on(\n\t"typed"');
	const end = source.indexOf("\n);", start);
	return source.slice(start, end + 3);
};

describe("playground", () => {
	it("uses the wiring of examples/search.ts", () => {
		const example = wiring(read("search.ts"));
		const playground = wiring(read("playground/main.ts"));

		expect(example).toContain("debounce(");
		expect(playground).toBe(example);
	});

	describe("with the fake api", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		type Events = { typed: string; results: Item[] };

		const setup = () => {
			const requests: RequestEvent[] = [];
			const results: string[][] = [];
			const api = createFakeApi((event) => requests.push(event));
			const bus = createBus<Events>();
			bus.on(
				"typed",
				debounce(
					300,
					latest(async (query, ctx) => {
						const items = await api.search(query, { signal: ctx.signal });
						ctx.emit("results", items);
					}),
				),
			);
			bus.on("results", (items) => {
				results.push(items.map((item) => item.title));
			});
			return { bus, requests, results };
		};

		it("sends one request for fast typing", async () => {
			const { bus, requests } = setup();

			bus.emit("typed", "n");
			bus.emit("typed", "na");
			bus.emit("typed", "nano");
			await vi.advanceTimersByTimeAsync(300);

			expect(requests).toEqual([{ query: "nano", status: "started" }]);
		});

		it("aborts a slow request when a newer query comes", async () => {
			const { bus, requests, results } = setup();

			bus.emit("typed", "nano");
			await vi.advanceTimersByTimeAsync(300 + 100);
			bus.emit("typed", "nanoeffects");
			await vi.advanceTimersByTimeAsync(300 + 800);

			expect(requests).toEqual([
				{ query: "nano", status: "started" },
				{ query: "nano", status: "aborted" },
				{ query: "nanoeffects", status: "started" },
				{ query: "nanoeffects", status: "done" },
			]);
			expect(results).toEqual([
				["nanoeffects (first)", "nanoeffects (second)"],
			]);
		});
	});
});
