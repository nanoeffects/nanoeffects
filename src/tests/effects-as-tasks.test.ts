// retry, timeout and poll as Tasks, composed with policies and run as children
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { retry, timeout } from "../effects";
import { debounce, latest } from "../policies";
import type { TestEvents } from "./test-helpers";

describe("effects as Tasks", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("a composition in on(...)", () => {
		it("debounce, latest, retry and timeout work together", async () => {
			const bus = createBus<TestEvents>();
			const log: string[] = [];
			let slowFirst = true;
			bus.on(
				"b",
				debounce(
					300,
					latest(
						retry(
							timeout(1000, async (query: string, ctx) => {
								log.push(`try ${query}`);
								// the first try of "final" hangs until its time limit, the next answers
								if (query === "final" && slowFirst) {
									slowFirst = false;
									await new Promise((_, reject) =>
										ctx.signal.addEventListener("abort", () =>
											reject(ctx.signal.reason),
										),
									);
								}
								log.push(`done ${query}`);
							}),
							{ times: 2 },
						),
					),
				),
			);
			bus.emit("b", "f");
			bus.emit("b", "fi");
			bus.emit("b", "final"); // only this one survives the debounce
			await vi.advanceTimersByTimeAsync(300);
			expect(log).toEqual(["try final"]);
			await vi.advanceTimersByTimeAsync(1000); // the time limit, then the second try
			await vi.advanceTimersByTimeAsync(0);

			expect(log).toEqual(["try final", "try final", "done final"]);
		});

		it("a newer event aborts the older attempt, and the older one never retries", async () => {
			const bus = createBus<TestEvents>();
			const signals: AbortSignal[] = [];
			const tries: string[] = [];
			bus.on(
				"b",
				latest(
					retry(
						async (query: string, ctx) => {
							tries.push(query);
							signals.push(ctx.signal);
							await new Promise((_, reject) =>
								ctx.signal.addEventListener("abort", () =>
									reject(ctx.signal.reason),
								),
							);
						},
						{ times: 3 },
					),
				),
			);
			bus.emit("b", "old");
			bus.emit("b", "new");
			await vi.advanceTimersByTimeAsync(0);

			expect(signals[0]?.aborted).toBe(true);
			expect(tries).toEqual(["old", "new"]);
		});
	});

	describe("ctx.run with a wrapped Task", () => {
		it("passes the payload, returns the result, and retries inside", async () => {
			const bus = createBus<TestEvents>();
			let calls = 0;
			const search = async (query: string) => {
				calls++;
				if (calls === 1) {
					throw new Error("once");
				}
				return `${query}!`;
			};
			const results: string[] = [];
			bus.on("b", async (query, ctx) => {
				results.push(await ctx.run(retry(search), query));
			});
			bus.emit("b", "nano");
			await vi.advanceTimersByTimeAsync(0);

			expect(results).toEqual(["nano!"]);
			expect(calls).toBe(2);
		});

		it("is aborted with the handler", async () => {
			const bus = createBus<TestEvents>();
			let signal: AbortSignal | null = null;
			let handlerContext: { abort: (reason?: unknown) => void } | null = null;
			bus.on("b", (query, ctx) => {
				handlerContext = ctx;
				ctx
					.run(
						timeout(10_000, (_value: string, child) => {
							signal = child.signal;
							return new Promise<never>(() => {});
						}),
						query,
					)
					.catch(() => {});
			});
			bus.emit("b", "x");
			await vi.advanceTimersByTimeAsync(0);
			(handlerContext as { abort: (reason?: unknown) => void } | null)?.abort(
				"stop",
			);

			expect((signal as AbortSignal | null)?.aborted).toBe(true);
		});

		it("a timeout inside ctx.run rejects the run, and the handler goes on", async () => {
			const bus = createBus<TestEvents>();
			const seen: string[] = [];
			bus.on("b", async (query, ctx) => {
				try {
					await ctx.run(
						timeout(50, () => new Promise<never>(() => {})),
						query,
					);
				} catch (error) {
					seen.push((error as Error).name);
				}
				seen.push("handler goes on");
			});
			bus.emit("b", "x");
			await vi.advanceTimersByTimeAsync(50);

			expect(seen).toEqual(["TimeoutError", "handler goes on"]);
		});
	});
});
