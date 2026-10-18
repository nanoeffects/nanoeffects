import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, deferred } from "../tests/test-helpers";
import { timeout } from "./timeout";

const never = () => new Promise<never>(() => {});

describe("timeout", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("result", () => {
		it("resolves with the starter's value", async () => {
			await expect(timeout({}, 100, () => 5)).resolves.toBe(5);
		});

		it("awaits an async starter", async () => {
			const gate = deferred<string>();
			const promise = timeout({}, 100, () => gate.promise);
			gate.resolve("done");

			await expect(promise).resolves.toBe("done");
		});

		it("clears the timer when the starter wins", async () => {
			await timeout({}, 100, () => 1);

			expect(vi.getTimerCount()).toBe(0);
		});

		it("rejects with the starter's error and clears the timer", async () => {
			await expect(
				timeout({}, 100, () => Promise.reject(new Error("boom"))),
			).rejects.toThrow("boom");
			expect(vi.getTimerCount()).toBe(0);
		});

		it("rejects with a sync error of the starter", async () => {
			await expect(
				timeout({}, 100, () => {
					throw new Error("boom");
				}),
			).rejects.toThrow("boom");
			expect(vi.getTimerCount()).toBe(0);
		});

		it("gives the starter a live signal and an abort", async () => {
			let live = false;
			await timeout({}, 100, ({ signal, abort }) => {
				live = !signal.aborted && typeof abort === "function";
			});

			expect(live).toBe(true);
		});
	});

	describe("expiry", () => {
		it("rejects with a TimeoutError once ms have passed", async () => {
			const promise = timeout({}, 100, never);
			const assertion = expect(promise).rejects.toMatchObject({
				name: "TimeoutError",
				message: "Timed out after 100ms",
			});
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		});

		it("is a DOMException, like AbortSignal.timeout", async () => {
			const promise = timeout({}, 100, never);
			const assertion = expect(promise).rejects.toBeInstanceOf(DOMException);
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		});

		it("does not reject before ms have passed", async () => {
			const settled = vi.fn();
			timeout({}, 100, never).catch(settled);
			await vi.advanceTimersByTimeAsync(99);

			expect(settled).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(settled).toHaveBeenCalledTimes(1);
		});

		it("aborts the starter's signal with the same error", async () => {
			const signals: AbortSignal[] = [];
			const promise = timeout({}, 100, ({ signal }) => {
				signals.push(signal);
				return never();
			});
			const assertion = expect(promise).rejects.toBeDefined();
			await vi.advanceTimersByTimeAsync(100);
			const error = await promise.catch((error: unknown) => error);
			await assertion;

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[0]?.reason).toBe(error);
		});

		it("rejects even if the starter ignores its signal", async () => {
			const gate = deferred();
			const promise = timeout({}, 100, () => gate.promise);
			const assertion = expect(promise).rejects.toHaveProperty(
				"name",
				"TimeoutError",
			);
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
			gate.resolve();
		});

		it("rejects with the reason when the starter aborts itself", async () => {
			const promise = timeout({}, 100, ({ abort }) => {
				abort("self");
				return never();
			});

			await expect(promise).rejects.toBe("self");
			expect(vi.getTimerCount()).toBe(0);
		});

		it("works with a zero timeout", async () => {
			const promise = timeout({}, 0, never);
			const assertion = expect(promise).rejects.toHaveProperty(
				"name",
				"TimeoutError",
			);
			await vi.advanceTimersByTimeAsync(0);

			await assertion;
		});
	});

	describe("abort", () => {
		it("rejects at once if already aborted, without starting", async () => {
			const controller = new AbortController();
			controller.abort("early");
			const starter = vi.fn();

			await expect(timeout(controller, 100, starter)).rejects.toBe("early");
			expect(starter).not.toHaveBeenCalled();
		});

		it("rejects with the reason when the parent aborts, and aborts the starter", async () => {
			const controller = new AbortController();
			const signals: AbortSignal[] = [];
			const promise = timeout(controller, 100, ({ signal }) => {
				signals.push(signal);
				return never();
			});
			const assertion = expect(promise).rejects.toBe("stop");
			controller.abort("stop");

			await assertion;
			expect(signals[0]?.aborted).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("stays quiet if the parent aborts after the result", async () => {
			const controller = new AbortController();
			const result = await timeout(controller, 100, () => 1);
			controller.abort();

			expect(result).toBe(1);
		});
	});

	describe("trace", () => {
		it("a starter that finishes in time", async () => {
			const harness = createHarness();
			await timeout(harness.ctx(), 100, () => 1);

			expect(harness.phases()).toEqual([
				"timeout/start",
				"run/start",
				"run/done",
				"timeout/done",
			]);
		});

		it("an expiry cancels the starter and ends the group with error", async () => {
			const harness = createHarness();
			const promise = timeout(harness.ctx(), 100, never).catch(() => {});
			await vi.advanceTimersByTimeAsync(100);
			await promise;

			expect(harness.phases()).toEqual([
				"timeout/start",
				"run/start",
				"run/cancel",
				"timeout/error",
			]);
			expect(harness.recorder.events.at(-1)?.error).toHaveProperty(
				"name",
				"TimeoutError",
			);
		});

		it("a parent abort ends the group with cancel", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = timeout(ctx, 100, never).catch(() => {});
			ctx.abort();
			await promise;

			expect(harness.phases()).toContain("timeout/cancel");
			expect(harness.phases()).not.toContain("timeout/error");
		});

		it("links the starter to the group", async () => {
			const harness = createHarness();
			await timeout(harness.ctx(), 100, () => 1);
			const group = harness.recorder.events.find(
				(event) => event.effect === "timeout",
			);
			const run = harness.recorder.events.find(
				(event) => event.effect === "run",
			);

			expect(run?.parent).toBe(group?.id);
		});
	});
});
