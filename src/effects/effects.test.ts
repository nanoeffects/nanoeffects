import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, deferred } from "../test-helpers";
import { all, delay, race } from ".";

const never = () => new Promise<never>(() => {});

describe("all", () => {
	describe("results", () => {
		it("resolves an object of starters by key", async () => {
			const result = await all({ a: () => 1, b: async () => 2 });

			expect(result).toEqual({ a: 1, b: 2 });
		});

		it("resolves an array of starters by index, whatever finishes first", async () => {
			const slow = deferred<string>();
			const promise = all([() => slow.promise, () => "fast"]);
			slow.resolve("slow");

			await expect(promise).resolves.toEqual(["slow", "fast"]);
		});

		it("resolves empty input", async () => {
			await expect(all({})).resolves.toEqual({});
			await expect(all([])).resolves.toEqual([]);
		});

		it("waits for every starter", async () => {
			const a = deferred<number>();
			const b = deferred<number>();
			const done = vi.fn();
			all({ a: () => a.promise, b: () => b.promise }).then(done);
			a.resolve(1);
			await new Promise((r) => setTimeout(r, 0));
			expect(done).not.toHaveBeenCalled();
			b.resolve(2);
			await new Promise((r) => setTimeout(r, 0));

			expect(done).toHaveBeenCalledWith({ a: 1, b: 2 });
		});

		it("gives each starter its own signal and abort", async () => {
			const signals: AbortSignal[] = [];
			const aborts: Array<(reason?: unknown) => void> = [];
			await all({
				a: ({ signal, abort }) => {
					signals.push(signal);
					aborts.push(abort);
				},
				b: ({ signal }) => {
					signals.push(signal);
				},
			});
			aborts[0]?.("only a");

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[1]?.aborted).toBe(false);
		});
	});

	describe("failure", () => {
		it("rejects with the first error", async () => {
			await expect(
				all({
					a: () => Promise.reject(new Error("first")),
					b: never,
				}),
			).rejects.toThrow("first");
		});

		it("rejects on a sync throw in a starter", async () => {
			await expect(
				all([
					() => {
						throw new Error("boom");
					},
				]),
			).rejects.toThrow("boom");
		});

		it("cancels the other starters on failure", async () => {
			const signals: AbortSignal[] = [];
			await all({
				a: ({ signal }) => {
					signals.push(signal);
					return never();
				},
				b: () => Promise.reject(new Error("boom")),
			}).catch(() => {});

			expect(signals[0]?.aborted).toBe(true);
		});

		it("does not leak an unhandled rejection when several starters fail", async () => {
			await all([
				() => Promise.reject(new Error("one")),
				() => Promise.reject(new Error("two")),
			]).catch(() => {});
			await new Promise((r) => setTimeout(r, 5));
		});

		it("does not cancel starters when all succeed", async () => {
			const signals: AbortSignal[] = [];
			await all([({ signal }) => signals.push(signal)]);

			expect(signals[0]).toBeDefined();
		});
	});

	describe("parent", () => {
		it("rejects with the reason if the parent is already aborted, starting nothing", async () => {
			const controller = new AbortController();
			controller.abort("early");
			const starter = vi.fn();

			await expect(all({ a: starter }, controller)).rejects.toBe("early");
			expect(starter).not.toHaveBeenCalled();
		});

		it("aborts the starters when a plain parent aborts", async () => {
			const controller = new AbortController();
			const signals: AbortSignal[] = [];
			const promise = all(
				{
					a: ({ signal }) => {
						signals.push(signal);
						return delay(1000, { signal });
					},
				},
				controller,
			);
			await Promise.resolve();
			controller.abort("stop");

			await expect(promise).rejects.toBe("stop");
			expect(signals[0]?.aborted).toBe(true);
		});

		it("aborts the starters when a task context aborts", async () => {
			const ctx = createHarness().ctx();
			const signals: AbortSignal[] = [];
			const promise = all(
				[
					({ signal }) => {
						signals.push(signal);
						return delay(1000, { signal });
					},
				],
				ctx,
			);
			await Promise.resolve();
			ctx.abort("stop");

			await expect(promise).rejects.toBe("stop");
			expect(signals[0]?.aborted).toBe(true);
		});

		it("rejects at once when the parent aborts, even if starters ignore the signal", async () => {
			const controller = new AbortController();
			const promise = all([never, never], controller);
			const assertion = expect(promise).rejects.toBe("stop");
			await Promise.resolve();
			controller.abort("stop");

			await assertion;
		});

		it("rejects at once when a task context aborts, and traces cancel", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const promise = all({ a: never }, ctx);
			const assertion = expect(promise).rejects.toBe("stop");
			ctx.abort("stop");
			await assertion;

			expect(h.phases()).toContain("all/cancel");
			expect(h.phases()).not.toContain("all/error");
		});

		it("does not reject after finishing when the parent aborts later", async () => {
			const controller = new AbortController();
			const result = await all({ a: () => 1 }, controller);
			controller.abort();
			await Promise.resolve();

			expect(result).toEqual({ a: 1 });
		});

		it("keeps the failure reason, not the abort, when a starter fails first", async () => {
			const controller = new AbortController();

			await expect(
				all([() => Promise.reject(new Error("boom")), never], controller),
			).rejects.toThrow("boom");
		});

		it("stops following the parent once finished", async () => {
			const controller = new AbortController();
			const signals: AbortSignal[] = [];
			await all([({ signal }) => signals.push(signal)], controller);
			controller.abort();

			expect(signals[0]?.aborted).toBe(false);
		});
	});

	describe("trace", () => {
		it("traces the group and every starter when given a task context", async () => {
			const h = createHarness();
			await all({ a: () => 1, b: () => 2 }, h.ctx());
			const phases = h.phases();

			expect(phases[0]).toBe("all/start");
			expect(phases.at(-1)).toBe("all/done");
			expect(phases.filter((p) => p === "run/start")).toHaveLength(2);
			expect(phases.filter((p) => p === "run/done")).toHaveLength(2);
		});

		it("links starters to the group", async () => {
			const h = createHarness();
			await all({ a: () => 1 }, h.ctx());
			const group = h.recorder.events.find((e) => e.effect === "all");
			const run = h.recorder.events.find((e) => e.effect === "run");

			expect(run?.parent).toBe(group?.id);
		});

		it("reports error for the group and cancel for the sibling", async () => {
			const h = createHarness();
			await all(
				[
					never,
					() => {
						throw new Error("bad");
					},
				],
				h.ctx(),
			).catch(() => {});
			const phases = h.phases();

			expect(phases).toContain("all/error");
			expect(phases).toContain("run/error");
			expect(phases).toContain("run/cancel");
			expect(phases).not.toContain("all/cancel");
		});

		it("reports cancel when the parent aborts", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const promise = all([({ signal }) => delay(1000, { signal })], ctx).catch(
				() => {},
			);
			await Promise.resolve();
			ctx.abort();
			await promise;
			const phases = h.phases();

			expect(phases).toContain("all/cancel");
			expect(phases).toContain("run/cancel");
			expect(phases).not.toContain("all/error");
		});

		it("is silent for a plain parent", async () => {
			const h = createHarness();
			await all({ a: () => 1 }, { signal: h.ctx().signal });

			expect(h.phases()).toEqual([]);
		});
	});
});

describe("race", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("resolves with the winner only, under its key", async () => {
		const result = await race({ a: () => "a", b: never });

		expect(result).toEqual({ a: "a" });
	});

	it("resolves an array form with the winner at its index", async () => {
		const result = await race([never, () => "second"]);

		expect(result[1]).toBe("second");
		expect(0 in result).toBe(false);
	});

	it("resolves empty input at once", async () => {
		await expect(race({})).resolves.toEqual({});
		await expect(race([])).resolves.toEqual([]);
	});

	it("takes the first to settle, not the first listed", async () => {
		const slow = deferred<string>();
		const promise = race({ slow: () => slow.promise, fast: () => "fast" });
		slow.resolve("slow");

		await expect(promise).resolves.toEqual({ fast: "fast" });
	});

	it("rejects if the first to settle fails", async () => {
		await expect(
			race({ a: () => Promise.reject(new Error("boom")), b: never }),
		).rejects.toThrow("boom");
	});

	it("ignores a late failure of a loser", async () => {
		const late = deferred<string>();
		const result = await race({ a: () => "a", b: () => late.promise });
		late.reject(new Error("late"));
		await Promise.resolve();

		expect(result).toEqual({ a: "a" });
	});

	it("aborts the losers", async () => {
		const signals: AbortSignal[] = [];
		await race({
			a: () => "win",
			b: ({ signal }) => {
				signals.push(signal);
				return never();
			},
		});

		expect(signals[0]?.aborted).toBe(true);
	});

	it("rejects with the reason if the parent is already aborted", async () => {
		const controller = new AbortController();
		controller.abort("early");

		await expect(race({ a: () => 1 }, controller)).rejects.toBe("early");
	});

	it("rejects when the parent aborts and starters honour their signals", async () => {
		const controller = new AbortController();
		const promise = race(
			{ a: ({ signal }) => delay(1000, { signal }) },
			controller,
		);
		const assertion = expect(promise).rejects.toBe("stop");
		await Promise.resolve();
		controller.abort("stop");

		await assertion;
	});

	it("rejects at once when the parent aborts, even if starters ignore the signal", async () => {
		const controller = new AbortController();
		const promise = race([never, never], controller);
		const assertion = expect(promise).rejects.toBe("stop");
		await Promise.resolve();
		controller.abort("stop");

		await assertion;
	});

	it("rejects at once when a task context aborts, and traces cancel", async () => {
		const h = createHarness();
		const ctx = h.ctx();
		const promise = race({ a: never }, ctx);
		const assertion = expect(promise).rejects.toBe("stop");
		ctx.abort("stop");
		await assertion;

		expect(h.phases()).toContain("race/cancel");
		expect(h.phases()).not.toContain("race/error");
	});

	it("does not reject after a win when the parent aborts later", async () => {
		const controller = new AbortController();
		const result = await race({ a: () => 1 }, controller);
		controller.abort();
		await Promise.resolve();

		expect(result).toEqual({ a: 1 });
	});

	describe("timeout flow", () => {
		it("data wins and the timeout timer is cleared", async () => {
			const promise = race({
				data: async () => "data",
				timeout: ({ signal }) => delay(5000, { signal }),
			});
			await vi.advanceTimersByTimeAsync(0);

			await expect(promise).resolves.toEqual({ data: "data" });
			expect(vi.getTimerCount()).toBe(0);
		});

		it("timeout wins and the slow request is aborted", async () => {
			const signals: AbortSignal[] = [];
			const promise = race({
				data: ({ signal }) => {
					signals.push(signal);
					return delay(10_000, { signal }).then(() => "data");
				},
				timeout: ({ signal }) => delay(5000, { signal }),
			});
			const assertion = expect(promise).resolves.toHaveProperty("timeout");
			await vi.advanceTimersByTimeAsync(5000);
			await assertion;

			expect(signals[0]?.aborted).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("trace", () => {
		it("reports done for the winner and cancel for the loser", async () => {
			const h = createHarness();
			await race({ a: () => "a", b: never }, h.ctx());
			const phases = h.phases();

			expect(phases[0]).toBe("race/start");
			expect(phases).toContain("race/done");
			expect(phases).toContain("run/done");
			expect(phases).toContain("run/cancel");
		});

		it("reports error when the first to settle fails", async () => {
			const h = createHarness();
			await race(
				{ a: () => Promise.reject(new Error("boom")), b: never },
				h.ctx(),
			).catch(() => {});

			expect(h.phases()).toContain("race/error");
		});

		it("reports one terminal event for the group", async () => {
			const h = createHarness();
			await race({ a: () => 1, b: never }, h.ctx());
			const groupTerminal = h.recorder.events.filter(
				(e) => e.effect === "race" && e.phase !== "start",
			);

			expect(groupTerminal).toHaveLength(1);
		});
	});
});
