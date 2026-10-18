import { describe, expect, it, vi } from "vitest";
import { createHarness, deferred } from "../tests/test-helpers";
import { allSettled } from "./allSettled";

const never = () => new Promise<never>(() => {});

describe("allSettled", () => {
	describe("results", () => {
		it("gives a status for each starter of an object", async () => {
			const result = await allSettled(
				{},
				{
					ok: () => 1,
					bad: () => Promise.reject(new Error("boom")),
				},
			);

			expect(result.ok).toEqual({ status: "fulfilled", value: 1 });
			expect(result.bad.status).toBe("rejected");
			expect((result.bad as PromiseRejectedResult).reason).toEqual(
				new Error("boom"),
			);
		});

		it("gives a status for each starter of an array, in order", async () => {
			const slow = deferred<string>();
			const promise = allSettled({}, [() => slow.promise, () => "fast"]);
			slow.resolve("slow");

			await expect(promise).resolves.toEqual([
				{ status: "fulfilled", value: "slow" },
				{ status: "fulfilled", value: "fast" },
			]);
		});

		it("resolves empty input", async () => {
			await expect(allSettled({}, {})).resolves.toEqual({});
			await expect(allSettled({}, [])).resolves.toEqual([]);
		});

		it("reports a sync throw as a rejected result", async () => {
			const results = await allSettled({}, [
				() => {
					throw new Error("boom");
				},
			]);

			expect(results[0]?.status).toBe("rejected");
		});

		it("resolves when every starter failed", async () => {
			const result = await allSettled({}, [
				() => Promise.reject(new Error("one")),
				() => Promise.reject(new Error("two")),
			]);

			expect(result.map((result) => result.status)).toEqual([
				"rejected",
				"rejected",
			]);
		});

		it("waits for the slowest starter", async () => {
			const first = deferred<number>();
			const second = deferred<number>();
			const done = vi.fn();
			allSettled({}, { a: () => first.promise, b: () => second.promise }).then(
				done,
			);
			first.resolve(1);
			await new Promise((result) => setTimeout(result, 0));
			expect(done).not.toHaveBeenCalled();
			second.reject(new Error("late"));
			await new Promise((result) => setTimeout(result, 0));

			expect(done).toHaveBeenCalledTimes(1);
		});
	});

	describe("failures", () => {
		it("does not cancel the other starters when one fails", async () => {
			const signals: AbortSignal[] = [];
			const slow = deferred<string>();
			const promise = allSettled(
				{},
				{
					bad: () => Promise.reject(new Error("boom")),
					slow: ({ signal }) => {
						signals.push(signal);
						return slow.promise;
					},
				},
			);
			await new Promise((result) => setTimeout(result, 0));
			expect(signals[0]?.aborted).toBe(false);
			slow.resolve("done");

			expect((await promise).slow).toEqual({
				status: "fulfilled",
				value: "done",
			});
		});

		it("does not leak an unhandled rejection", async () => {
			await allSettled({}, [() => Promise.reject(new Error("boom"))]);
			await new Promise((result) => setTimeout(result, 5));
		});
	});

	describe("start and abort", () => {
		it("calls every starter synchronously, in order", () => {
			const calls: string[] = [];
			allSettled({}, [() => calls.push("a"), () => calls.push("b")]);

			expect(calls).toEqual(["a", "b"]);
		});

		it("rejects with the reason if already aborted, starting nothing", async () => {
			const controller = new AbortController();
			controller.abort("early");
			const starter = vi.fn();

			await expect(allSettled(controller, [starter])).rejects.toBe("early");
			expect(starter).not.toHaveBeenCalled();
		});

		it("rejects at once when the parent aborts, even if starters ignore the signal", async () => {
			const controller = new AbortController();
			const signals: AbortSignal[] = [];
			const promise = allSettled(controller, [
				({ signal }) => {
					signals.push(signal);
					return never();
				},
			]);
			const assertion = expect(promise).rejects.toBe("stop");
			controller.abort("stop");

			await assertion;
			expect(signals[0]?.aborted).toBe(true);
		});

		it("stays quiet if the parent aborts after the result", async () => {
			const controller = new AbortController();
			const result = await allSettled(controller, [() => 1]);
			controller.abort();

			expect(result).toEqual([{ status: "fulfilled", value: 1 }]);
		});
	});

	describe("trace", () => {
		it("ends the group with done even when a starter failed", async () => {
			const harness = createHarness();
			await allSettled(harness.ctx(), [
				() => 1,
				() => Promise.reject(new Error("boom")),
			]);
			const phases = harness.phases();

			expect(phases[0]).toBe("allSettled/start");
			expect(phases.at(-1)).toBe("allSettled/done");
			expect(phases).toContain("run/error");
			expect(phases).not.toContain("allSettled/error");
		});

		it("ends the group with cancel when the task aborts", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = allSettled(ctx, [never]).catch(() => {});
			ctx.abort();
			await promise;

			expect(harness.phases()).toContain("allSettled/cancel");
		});
	});
});
