import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLifecycle, reportsLifecycle } from "../core/lifecycle-key";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { type BatchOptions, batch } from "./batch";
import { withPolicy } from "./with-policy";

// the events of the harness are pinned, so a context of the harness fits
const batched = <P, R>(
	ms: number,
	handler: Task<P[], TestEvents, R>,
	options?: BatchOptions<P>,
) => batch(ms, handler, options);

const lifecycle = () => ({
	start: vi.fn(),
	drop: vi.fn(),
	cancel: vi.fn(),
	done: vi.fn(),
});

describe("batch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("the window", () => {
		it("calls the handler once with the payloads of the window, in order", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => "sent");
			const task = batched(100, handler);
			task(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(40);
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(50);
			task(3, harness.ctx());
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(10);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toEqual([1, 2, 3]);
		});

		it("does not move the window when more calls come", async () => {
			const harness = createHarness();
			const sent: number[][] = [];
			const task = batched(100, (values: number[]) => {
				sent.push(values);
			});
			for (let index = 0; index < 8; index++) {
				task(index, harness.ctx());
				await vi.advanceTimersByTimeAsync(60);
			}
			await vi.advanceTimersByTimeAsync(100);

			expect(sent.length).toBeGreaterThanOrEqual(4);
			expect(sent.flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		});

		it("sends a single payload as an array of one", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => 1);
			batched(50, handler)(5, harness.ctx());
			await vi.advanceTimersByTimeAsync(50);

			expect(handler.mock.calls[0]?.[0]).toEqual([5]);
		});

		it("opens the next window at the next call after a send", async () => {
			const harness = createHarness();
			const sent: number[][] = [];
			const task = batched(100, (values: number[]) => {
				sent.push(values);
			});
			task(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			await vi.advanceTimersByTimeAsync(500);
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(99);
			expect(sent).toEqual([[1]]);
			await vi.advanceTimersByTimeAsync(1);

			expect(sent).toEqual([[1], [2]]);
		});

		it("sends a full batch at once and clears its timer", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => 1);
			const task = batched(1000, handler, { maxSize: 2 });
			task(1, harness.ctx());
			expect(vi.getTimerCount()).toBe(1);
			task(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toEqual([1, 2]);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("opens a new window after a full batch", async () => {
			const harness = createHarness();
			const sent: number[][] = [];
			const task = batched(
				100,
				(values: number[]) => {
					sent.push(values);
				},
				{ maxSize: 2 },
			);
			for (const value of [1, 2, 3]) {
				task(value, harness.ctx());
			}
			await vi.advanceTimersByTimeAsync(100);

			expect(sent).toEqual([[1, 2], [3]]);
		});

		it("takes a maxSize below 1 or NaN as 1", () => {
			for (const odd of [0, -2, Number.NaN]) {
				const harness = createHarness();
				const handler = vi.fn((_values: number[]) => 1);
				batched(1000, handler, { maxSize: odd })(1, harness.ctx());

				expect(handler).toHaveBeenCalledTimes(1);
			}
		});

		it("does not limit the size without maxSize", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => 1);
			const task = batched(10, handler);
			for (let index = 0; index < 5000; index++) {
				task(index, harness.ctx());
			}
			await vi.advanceTimersByTimeAsync(10);

			expect(handler.mock.calls[0]?.[0]).toHaveLength(5000);
		});

		it("waits with a window of 0 for the next timer, not for the call", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => 1);
			const task = batched(0, handler);
			task(1, harness.ctx());
			task(2, harness.ctx());
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(0);

			expect(handler.mock.calls[0]?.[0]).toEqual([1, 2]);
		});
	});

	describe("results", () => {
		it("resolves every call with the value of the one run", async () => {
			const harness = createHarness();
			const task = batched(100, (_values: number[]) => "ok");
			const calls = [1, 2, 3].map((value) => task(value, harness.ctx()));
			await vi.advanceTimersByTimeAsync(100);

			await expect(Promise.all(calls)).resolves.toEqual(["ok", "ok", "ok"]);
		});

		it("rejects every call with the same error", async () => {
			const harness = createHarness();
			const failure = new Error("boom");
			const task = batched(100, async (_values: number[]) => {
				throw failure;
			});
			const calls = [1, 2, 3].map((value) => task(value, harness.ctx()));
			const settled = Promise.allSettled(calls);
			await vi.advanceTimersByTimeAsync(100);

			expect(await settled).toEqual(
				[1, 2, 3].map(() => ({ status: "rejected", reason: failure })),
			);
		});

		it("turns a synchronous throw into a rejection of every call", async () => {
			const harness = createHarness();
			const failure = new Error("sync");
			const task = batched(100, (_values: number[]) => {
				throw failure;
			});
			const first = task(1, harness.ctx());
			const second = task(2, harness.ctx());
			const settled = Promise.allSettled([first, second]);
			await vi.advanceTimersByTimeAsync(100);

			expect(await settled).toEqual([
				{ status: "rejected", reason: failure },
				{ status: "rejected", reason: failure },
			]);
		});

		it("lets the next batch go on after an error", async () => {
			const harness = createHarness();
			const handler = vi
				.fn<(values: number[]) => Promise<string>>()
				.mockRejectedValueOnce(new Error("first"))
				.mockResolvedValueOnce("second");
			const task = batched(100, handler);
			const first = task(1, harness.ctx());
			first.catch(() => {});
			await vi.advanceTimersByTimeAsync(100);
			const second = task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(first).rejects.toThrow("first");
			await expect(second).resolves.toBe("second");
		});

		it("does not wait for a run before it sends the next batch", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => new Promise<void>(() => {}));
			const task = batched(100, handler);
			task(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("abort", () => {
		it("takes a call that aborts while collecting out of the batch", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => "sent");
			const task = batched(100, handler);
			const ctx = harness.ctx();
			task(1, harness.ctx());
			const aborted = task(2, ctx);
			task(3, harness.ctx());
			ctx.abort();
			await vi.advanceTimersByTimeAsync(100);

			await expect(aborted).resolves.toBeUndefined();
			expect(handler.mock.calls[0]?.[0]).toEqual([1, 3]);
		});

		it("runs nothing and leaves no timer when the only call aborts", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const ctx = harness.ctx();
			const call = batched(100, handler)(1, ctx);
			ctx.abort();
			expect(vi.getTimerCount()).toBe(0);
			await vi.advanceTimersByTimeAsync(200);

			await expect(call).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("does not start a call that is aborted already", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const ctx = harness.ctx();
			ctx.abort();

			await expect(batched(100, handler)(1, ctx)).resolves.toBeUndefined();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("lets the others get the result when a caller aborts after the send", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const task = batched(100, (_values: number[]) => gate.promise);
			const ctx = harness.ctx();
			const owner = task(1, harness.ctx());
			const leaver = task(2, ctx);
			const third = task(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			ctx.abort();
			gate.resolve("sent");

			await expect(leaver).resolves.toBeUndefined();
			await expect(owner).resolves.toBe("sent");
			await expect(third).resolves.toBe("sent");
		});

		it("gives the handler the context of the first caller that is still waiting", async () => {
			const harness = createHarness();
			const seen: unknown[] = [];
			const task = batched(100, (_values: number[], ctx) => {
				seen.push(ctx);
			});
			const first = harness.ctx();
			const second = harness.ctx();
			task(1, first);
			task(2, second);
			first.abort();
			await vi.advanceTimersByTimeAsync(100);

			expect(seen).toEqual([second]);
		});

		it("aborts the run and resolves everyone with undefined when its owner aborts", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const gate = deferred<string>();
			const task = batched(100, (_values: number[], ctx) => {
				signals.push(ctx.signal);
				return gate.promise;
			});
			const ownerCtx = harness.ctx();
			const owner = task(1, ownerCtx);
			const other = task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			ownerCtx.abort("left");
			gate.resolve("late");

			expect(signals[0]?.aborted).toBe(true);
			await expect(owner).resolves.toBeUndefined();
			await expect(other).resolves.toBeUndefined();
		});

		it("does not start the run again after the owner aborted", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => new Promise<void>(() => {}));
			const task = batched(100, handler);
			const ownerCtx = harness.ctx();
			task(1, ownerCtx);
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			ownerCtx.abort();
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("keys", () => {
		it("collects a batch for each key", async () => {
			const harness = createHarness();
			const sent: string[][] = [];
			const task = batched(
				100,
				(values: string[]) => {
					sent.push(values);
				},
				{ key: (value) => value[0] },
			);
			for (const value of ["a1", "b1", "a2", "b2", "a3"]) {
				task(value, harness.ctx());
			}
			await vi.advanceTimersByTimeAsync(100);

			expect(sent).toEqual([
				["a1", "a2", "a3"],
				["b1", "b2"],
			]);
		});

		it("keeps maxSize for each key", () => {
			const harness = createHarness();
			const handler = vi.fn((_values: string[]) => 1);
			const task = batched(1000, handler, {
				key: (value) => value[0],
				maxSize: 2,
			});
			for (const value of ["a1", "b1", "a2"]) {
				task(value, harness.ctx());
			}

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toEqual(["a1", "a2"]);
		});

		it("leaves no timer after the keys were sent", async () => {
			const harness = createHarness();
			const task = batched(100, (_values: number[]) => 1, {
				key: (value: number) => value,
			});
			for (let index = 0; index < 50; index++) {
				task(index, harness.ctx());
			}
			await vi.advanceTimersByTimeAsync(100);

			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("job lifecycle", () => {
		it("is marked as a policy that reports", () => {
			expect(
				Reflect.get(
					batch(10, (_values: number[]) => 1),
					reportsLifecycle,
				),
			).toBe(true);
		});

		it("tells the job of the owner once, and drops the others", async () => {
			const harness = createHarness();
			const task = batched(100, (_values: number[]) => "sent");
			const reports = [lifecycle(), lifecycle(), lifecycle()];
			const calls = reports.map((report) => {
				const ctx = harness.ctx();
				Reflect.set(ctx, callLifecycle, report);
				return task(1, ctx);
			});
			expect(reports[0]?.start).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(100);
			await Promise.all(calls);

			expect(reports[0]?.start).toHaveBeenCalledTimes(1);
			expect(reports[0]?.done).toHaveBeenCalledWith({ value: "sent" });
			for (const other of [reports[1], reports[2]]) {
				expect(other?.start).not.toHaveBeenCalled();
				expect(other?.drop).toHaveBeenCalledTimes(1);
			}
		});

		it("drops the others before they hear of an error", async () => {
			const harness = createHarness();
			const task = batched(100, async (_values: number[]) => {
				throw new Error("boom");
			});
			const order: string[] = [];
			const other = lifecycle();
			other.drop.mockImplementation(() => order.push("drop"));
			const otherCtx = harness.ctx();
			Reflect.set(otherCtx, callLifecycle, other);
			const first = task(1, harness.ctx());
			const second = task(2, otherCtx);
			first.catch(() => {});
			second.catch(() => order.push("rejected"));
			await vi.advanceTimersByTimeAsync(100);

			expect(order).toEqual(["drop", "rejected"]);
		});

		it("drops a call that aborts while collecting", async () => {
			const harness = createHarness();
			const task = batched(100, (_values: number[]) => 1);
			const report = lifecycle();
			const ctx = harness.ctx();
			Reflect.set(ctx, callLifecycle, report);
			task(1, harness.ctx());
			task(2, ctx);
			ctx.abort();

			expect(report.drop).toHaveBeenCalledTimes(1);
			expect(report.start).not.toHaveBeenCalled();
		});
	});

	describe("forms", () => {
		it("behaves the same in the wrapper form", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => 1);
			const task = batch(100)<number, TestEvents, number>(handler);
			task(1, harness.ctx());
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls[0]?.[0]).toEqual([1, 2]);
		});

		it("takes a key in the wrapper form", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: string[]) => 1);
			const task = batch(100, { key: (value: string) => value })<
				TestEvents,
				number
			>(handler);
			task("a", harness.ctx());
			task("b", harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("accepts null options as the defaults", async () => {
			const harness = createHarness();
			const handler = vi.fn((_values: number[]) => 1);
			const task = batched(100, handler, {
				key: null,
				maxSize: null,
			} as never);
			task(1, harness.ctx());
			task(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("works as a plain function through withPolicy", async () => {
			const handler = vi.fn((_values: number[]) => "sent");
			const send = withPolicy(batch(100, handler));
			const first = send(1);
			const second = send(2);
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls[0]?.[0]).toEqual([1, 2]);
			await expect(first).resolves.toBe("sent");
			await expect(second).resolves.toBe("sent");
		});

		it("drops what is collected on withPolicy.cancel", async () => {
			const handler = vi.fn((_values: number[]) => "sent");
			const send = withPolicy(batch(100, handler));
			const call = send(1);
			send.cancel();
			await vi.advanceTimersByTimeAsync(200);

			await expect(call).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});
	});
});
