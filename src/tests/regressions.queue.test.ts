// Tricky cases taken from issues of other libraries, run against our queue.
//
// p-queue:    #29, #23, #110, #87
// bottleneck: #134, #95, #63
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModule } from "../actions";
import type { Task } from "../core/types";
import { timeout } from "../effects";
import { queue } from "../policies";
import {
	createApp,
	createHarness,
	deferred,
	type TestEvents,
} from "./test-helpers";

const queueTask = <P, R>(
	handler: Task<P, TestEvents, R>,
	options?: Parameters<typeof queue>[1],
) => queue(handler, options);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("regressions: queues", () => {
	describe("p-queue #29: one rejected task", () => {
		it("rejects only that call, the others resolve", async () => {
			const harness = createHarness();
			const queued = queueTask(async (value: number) => {
				if (value === 2) {
					throw new Error("boom");
				}
				return value;
			});
			const results = await Promise.allSettled(
				[1, 2, 3].map((value) => queued(value, harness.ctx())),
			);

			expect(results.map((result) => result.status)).toEqual([
				"fulfilled",
				"rejected",
				"fulfilled",
			]);
		});

		it("the queue is idle afterwards and starts the next call at once", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => {
				if (value === 1) {
					throw new Error("boom");
				}
				return value;
			});
			const queued = queueTask(handler);
			await queued(1, harness.ctx()).catch(() => {});
			queued(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("a failing call does not produce an unhandled rejection when the caller handles it", async () => {
			const harness = createHarness();
			const queued = queueTask(async () => {
				throw new Error("boom");
			});
			await queued(1, harness.ctx()).catch(() => {});
			await flush();
		});
	});

	describe("p-queue #23: the queue is cleared while something runs", () => {
		it("after every waiting and running call is aborted, a new call runs at once", () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise(() => {}));
			const queued = queueTask(handler);
			const ctxs = [harness.ctx(), harness.ctx(), harness.ctx(), harness.ctx()];
			for (const ctx of ctxs) {
				queued(1, ctx);
			}
			expect(handler).toHaveBeenCalledTimes(1);
			// the waiting calls first: aborting the running one frees a slot for the next
			for (const ctx of ctxs.reverse()) {
				ctx.abort("clear");
			}
			queued(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("the calls that were waiting resolve with undefined", async () => {
			const harness = createHarness();
			const queued = queueTask(() => new Promise(() => {}));
			const first = harness.ctx();
			const second = harness.ctx();
			queued(1, first);
			const waiting = queued(2, second);
			first.abort();
			second.abort();

			await expect(waiting).resolves.toBeUndefined();
		});
	});

	describe("p-queue #110, bottleneck #134: a task that never ends holds a slot", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("without a timeout one hanging call blocks the queue", async () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise(() => {}));
			const queued = queueTask(handler);
			queued(1, harness.ctx());
			queued(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(60_000);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("with a timeout around the task the slot comes back", async () => {
			const harness = createHarness();
			const started: number[] = [];
			const queued = queueTask((value: number, ctx) =>
				timeout(ctx, 100, () => {
					started.push(value);
					return new Promise(() => {});
				}),
			);
			const first = queued(1, harness.ctx()).catch(() => "timed out");
			queued(2, harness.ctx()).catch(() => {});
			await vi.advanceTimersByTimeAsync(100);
			await first;
			await vi.advanceTimersByTimeAsync(100);

			expect(started).toEqual([1, 2]);
		});

		it("the slot comes back for every hanging call in turn", async () => {
			const harness = createHarness();
			const started: number[] = [];
			const queued = queueTask((value: number, ctx) =>
				timeout(ctx, 50, () => {
					started.push(value);
					return new Promise(() => {});
				}),
			);
			for (let index = 1; index <= 5; index++) {
				queued(index, harness.ctx()).catch(() => {});
			}
			await vi.advanceTimersByTimeAsync(400);

			expect(started).toEqual([1, 2, 3, 4, 5]);
		});
	});

	describe("bottleneck #134: slots that stay 'running'", () => {
		it("a task that throws something that is not an Error frees its slot", async () => {
			const harness = createHarness();
			const values = [void 0, null, 0, "", false, { reason: "x" }];
			let index = 0;
			const queued = queueTask(async () => {
				throw values[index++ % values.length];
			});
			const results = await Promise.allSettled(
				values.map(() => queued(0, harness.ctx())),
			);

			expect(results.every((result) => result.status === "rejected")).toBe(
				true,
			);
			expect(index).toBe(values.length);
		});

		it("after thousands of mixed outcomes the queue is idle and starts a new call at once", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => {
				if (value % 7 === 0) {
					throw new Error("boom");
				}
				if (value % 11 === 0) {
					throw null;
				}
				return value;
			});
			const queued = queueTask(handler, { concurrency: 3 });
			await Promise.allSettled(
				Array.from({ length: 3000 }, (_, value) =>
					queued(value + 1, harness.ctx()),
				),
			);
			const before = handler.mock.calls.length;
			queued(1, harness.ctx());

			expect(handler.mock.calls.length).toBe(before + 1);
		});

		it("never runs more than the limit at the same time over many calls", async () => {
			const harness = createHarness();
			let running = 0;
			let max = 0;
			const queued = queueTask(
				async (value: number) => {
					running++;
					max = Math.max(max, running);
					await Promise.resolve();
					running--;
					if (value % 5 === 0) {
						throw new Error("boom");
					}
				},
				{ concurrency: 4 },
			);
			await Promise.allSettled(
				Array.from({ length: 2000 }, (_, value) =>
					queued(value, harness.ctx()),
				),
			);

			expect(max).toBe(4);
		});
	});

	describe("p-queue #87: backpressure", () => {
		it("a limit keeps the line short however many calls come", async () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn(() => gate.promise);
			const queued = queueTask(handler, { limit: 10 });
			const calls: Array<Promise<unknown>> = [];
			for (let index = 0; index < 100_000; index++) {
				calls.push(queued(index, harness.ctx()));
			}
			gate.resolve();
			await Promise.all(calls);

			expect(handler).toHaveBeenCalledTimes(11);
		});

		it("with drop-old the latest calls are the ones that run", async () => {
			const harness = createHarness();
			const gate = deferred();
			const started: number[] = [];
			const queued = queueTask(
				(value: number) => {
					started.push(value);
					return gate.promise;
				},
				{ limit: 3, overflow: "drop-old" },
			);
			const calls: Array<Promise<unknown>> = [];
			for (let index = 0; index < 1000; index++) {
				calls.push(queued(index, harness.ctx()));
			}
			gate.resolve();
			await Promise.all(calls);

			expect(started).toEqual([0, 997, 998, 999]);
		});
	});

	describe("bottleneck #95: a very long line", () => {
		it("runs 50 thousand waiting calls in order", async () => {
			const harness = createHarness();
			const order: number[] = [];
			const queued = queueTask((value: number) => {
				order.push(value);
			});
			const calls: Array<Promise<unknown>> = [];
			for (let index = 0; index < 50_000; index++) {
				calls.push(queued(index, harness.ctx()));
			}
			await Promise.all(calls);

			expect(order).toHaveLength(50_000);
			expect(order.slice(0, 3)).toEqual([0, 1, 2]);
			expect(order.at(-1)).toBe(49_999);
		});
	});

	describe("bottleneck #63: a safe shutdown", () => {
		it("disposing the app drops the waiting calls and runs nothing more", async () => {
			const handler = vi.fn(() => new Promise(() => {}));
			const app = createApp<TestEvents>();
			let results: Array<Promise<unknown>> = [];
			app.mount(
				createModule<TestEvents>("worker", (moduleContext) => {
					const queued = queue<number, TestEvents, unknown>(handler);
					results = [1, 2, 3, 4].map((value) => queued(value, moduleContext));
				}),
			);
			expect(handler).toHaveBeenCalledTimes(1);
			app.dispose();

			await expect(Promise.all(results.slice(1))).resolves.toEqual([
				void 0,
				void 0,
				void 0,
			]);
			expect(handler).toHaveBeenCalledTimes(1);
		});
	});
});
