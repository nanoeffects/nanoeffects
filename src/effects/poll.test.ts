import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, deferred } from "../tests/test-helpers";
import { poll } from "./poll";

describe("poll", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("schedule (like patronum interval)", () => {
		it("makes the first call after ms, not at once", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			poll(controller, handler, 100);
			await vi.advanceTimersByTimeAsync(99);
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);

			expect(handler).toHaveBeenCalledTimes(1);
			controller.abort();
		});

		it("calls fn every ms", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			poll(controller, handler, 100);
			await vi.advanceTimersByTimeAsync(350);

			expect(handler).toHaveBeenCalledTimes(3);
			controller.abort();
		});

		it("passes the call number, starting at 0", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			poll(controller, handler, 10);
			await vi.advanceTimersByTimeAsync(35);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
			controller.abort();
		});

		it("keeps a steady rate whatever the duration of fn, so calls may overlap", async () => {
			const controller = new AbortController();
			const starts: number[] = [];
			const start = Date.now();
			let running = 0;
			let max = 0;
			poll(
				controller,
				async () => {
					starts.push(Date.now() - start);
					running++;
					max = Math.max(max, running);
					await new Promise((result) => setTimeout(result, 250));
					running--;
				},
				100,
			);
			await vi.advanceTimersByTimeAsync(450);

			expect(starts).toEqual([100, 200, 300, 400]);
			expect(max).toBeGreaterThan(1);
			controller.abort();
		});

		it("does not wait for fn: a never-ending fn does not stop the ticks", async () => {
			const controller = new AbortController();
			const handler = vi.fn(() => new Promise(() => {}));
			poll(controller, handler, 100);
			await vi.advanceTimersByTimeAsync(350);

			expect(handler).toHaveBeenCalledTimes(3);
			controller.abort();
		});
	});

	describe("leading", () => {
		it("also calls fn at once", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			poll(controller, handler, 100, { leading: true });
			await vi.advanceTimersByTimeAsync(0);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([0, 1]);
			controller.abort();
		});

		it("calls fn synchronously", () => {
			const controller = new AbortController();
			const handler = vi.fn();
			poll(controller, handler, 100, { leading: true });

			expect(handler).toHaveBeenCalledTimes(1);
			controller.abort();
		});
	});

	describe("waitForFn", () => {
		it("starts each pause when the call ends, so calls never overlap", async () => {
			const controller = new AbortController();
			let running = 0;
			let max = 0;
			const starts: number[] = [];
			const start = Date.now();
			poll(
				controller,
				async () => {
					starts.push(Date.now() - start);
					running++;
					max = Math.max(max, running);
					await new Promise((result) => setTimeout(result, 50));
					running--;
				},
				100,
				{ waitForFn: true },
			);
			await vi.advanceTimersByTimeAsync(500);

			expect(starts).toEqual([100, 250, 400]);
			expect(max).toBe(1);
			controller.abort();
		});

		it("with leading starts at once, then every ms after each call ends", async () => {
			const controller = new AbortController();
			const starts: number[] = [];
			const start = Date.now();
			poll(
				controller,
				async () => {
					starts.push(Date.now() - start);
					await new Promise((result) => setTimeout(result, 50));
				},
				100,
				{ waitForFn: true, leading: true },
			);
			await vi.advanceTimersByTimeAsync(350);

			expect(starts).toEqual([0, 150, 300]);
			controller.abort();
		});

		it("stops waiting for fn when the task aborts", async () => {
			const controller = new AbortController();
			const gate = deferred();
			const handler = vi.fn(() => gate.promise);
			const done = poll(controller, handler, 100, { waitForFn: true });
			await vi.advanceTimersByTimeAsync(100);
			controller.abort();
			gate.resolve();
			await vi.advanceTimersByTimeAsync(1000);

			await expect(done).resolves.toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("stopping", () => {
		it("resolves, not rejects, when the context aborts", async () => {
			const controller = new AbortController();
			const promise = poll(controller, () => {}, 100);
			await vi.advanceTimersByTimeAsync(50);
			controller.abort("stop");

			await expect(promise).resolves.toBeUndefined();
		});

		it("makes no more calls and clears the timer after the abort", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			poll(controller, handler, 100);
			await vi.advanceTimersByTimeAsync(150);
			controller.abort();
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("clears the timer at once when aborted before the first call", () => {
			const controller = new AbortController();
			poll(controller, () => {}, 100);
			controller.abort();

			expect(vi.getTimerCount()).toBe(0);
		});

		it("resolves at once even if fn is still running and ignores the abort", async () => {
			const controller = new AbortController();
			const gate = deferred();
			const promise = poll(controller, () => gate.promise, 100);
			await vi.advanceTimersByTimeAsync(100);
			controller.abort();

			await expect(promise).resolves.toBeUndefined();
			gate.resolve();
		});

		it("resolves without calling fn if already aborted", async () => {
			const controller = new AbortController();
			controller.abort();
			const handler = vi.fn();

			await expect(poll(controller, handler, 100)).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("rejects, stops and clears the timer when fn throws", async () => {
			const controller = new AbortController();
			const handler = vi.fn(() => {
				throw new Error("boom");
			});
			const promise = poll(controller, handler, 100);
			const assertion = expect(promise).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(1000);

			await assertion;
			expect(handler).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("rejects and stops when an async fn rejects", async () => {
			const controller = new AbortController();
			const handler = vi.fn(async (tick: number) => {
				if (tick === 1) {
					throw new Error("boom");
				}
			});
			const promise = poll(controller, handler, 100);
			const assertion = expect(promise).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(1000);

			await assertion;
			expect(handler).toHaveBeenCalledTimes(2);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("an error of a slow call stops the ticks that follow it", async () => {
			const controller = new AbortController();
			const handler = vi.fn((tick: number) =>
				tick === 0
					? new Promise((_resolve, reject) =>
							setTimeout(() => reject(new Error("late boom")), 250),
						)
					: new Promise(() => {}),
			);
			const promise = poll(controller, handler, 100);
			const assertion = expect(promise).rejects.toThrow("late boom");
			await vi.advanceTimersByTimeAsync(1000);

			await assertion;
			expect(handler).toHaveBeenCalledTimes(3); // ticks at 100, 200, 300; the error came at 350
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("trace", () => {
		it("traces every call and ends the group with cancel", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = poll(ctx, () => {}, 100);
			await vi.advanceTimersByTimeAsync(250);
			ctx.abort();
			await promise;

			expect(harness.phases()).toEqual([
				"poll/start",
				"run/start",
				"run/done",
				"run/start",
				"run/done",
				"poll/cancel",
			]);
		});

		it("ends the group with error when fn throws", async () => {
			const harness = createHarness();
			const promise = poll(
				harness.ctx(),
				() => {
					throw new Error("boom");
				},
				100,
			).catch(() => {});
			await vi.advanceTimersByTimeAsync(100);
			await promise;

			expect(harness.phases()).toEqual([
				"poll/start",
				"run/start",
				"run/error",
				"poll/error",
			]);
		});

		it("links the calls to the group", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = poll(ctx, () => {}, 100);
			await vi.advanceTimersByTimeAsync(100);
			ctx.abort();
			await promise;
			const group = harness.recorder.events.find(
				(event) => event.effect === "poll",
			);
			const run = harness.recorder.events.find(
				(event) => event.effect === "run",
			);

			expect(run?.parent).toBe(group?.id);
		});

		it("traces an unfinished call as cancelled after its group when the task aborts", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = poll(ctx, () => new Promise(() => {}), 100);
			await vi.advanceTimersByTimeAsync(100);
			ctx.abort();
			await promise;

			expect(harness.phases()).toEqual([
				"poll/start",
				"run/start",
				"poll/cancel",
				"run/cancel",
			]);
		});

		it("traces nothing for an already aborted context", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			await poll(ctx, () => {}, 100);

			expect(harness.phases()).toEqual([]);
		});
	});

	describe("ms as a function", () => {
		const timeline = async (
			ms: (call: number) => number,
			options: Parameters<typeof poll>[3],
			until: number,
			handler: (tick: number) => unknown = () => {},
		) => {
			const controller = new AbortController();
			const starts: number[] = [];
			const start = Date.now();
			poll(
				controller,
				(tick) => {
					starts.push(Date.now() - start);
					return handler(tick);
				},
				ms,
				options,
			);
			await vi.advanceTimersByTimeAsync(until);
			controller.abort();
			return starts;
		};

		it("gets the number of the call each pause leads to, starting at 0", async () => {
			const asked: number[] = [];
			await timeline(
				(call) => {
					asked.push(call);
					return 100;
				},
				{},
				350,
			);

			expect(asked.slice(0, 4)).toEqual([0, 1, 2, 3]);
		});

		it("supports a growing pause", async () => {
			const starts = await timeline((call) => 100 * (call + 1), {}, 700);

			expect(starts).toEqual([100, 300, 600]);
		});

		it("supports an exponential pause with a cap", async () => {
			const starts = await timeline(
				(call) => Math.min(100 * 2 ** call, 300),
				{},
				1000,
			);

			expect(starts).toEqual([100, 300, 600, 900]);
		});

		it("leading starts at once, and the first pause leads to call 1", async () => {
			const asked: number[] = [];
			const starts = await timeline(
				(call) => {
					asked.push(call);
					return 100 * call;
				},
				{ leading: true },
				400,
			);

			expect(starts).toEqual([0, 100, 300]);
			expect(asked[0]).toBe(1);
		});

		it("with waitForFn each pause starts after the previous call ends", async () => {
			const starts = await timeline(
				(call) => 100 * (call + 1),
				{ waitForFn: true },
				800,
				() => new Promise((result) => setTimeout(result, 50)),
			);

			expect(starts).toEqual([100, 350, 700]); // 100, then 50 + 200, then 50 + 300 more
		});

		it("supports a random pause", async () => {
			vi.spyOn(Math, "random").mockReturnValue(0.5);
			const starts = await timeline(() => 50 + Math.random() * 100, {}, 400);

			expect(starts).toEqual([100, 200, 300, 400]);
			vi.restoreAllMocks();
		});

		it("rejects and clears the timer if the function throws", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			const promise = poll(controller, handler, (call) => {
				if (call === 1) {
					throw new Error("bad pause");
				}
				return 100;
			});
			const assertion = expect(promise).rejects.toThrow("bad pause");
			await vi.advanceTimersByTimeAsync(1000);

			await assertion;
			expect(handler).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("clears the timer when the task aborts", async () => {
			const controller = new AbortController();
			poll(
				controller,
				() => {},
				() => 1000,
			);
			controller.abort();

			expect(vi.getTimerCount()).toBe(0);
		});
	});
});
