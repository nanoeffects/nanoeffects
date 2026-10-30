import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { Task } from "../core/types";
import {
	createHarness,
	type Deferred,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { type QueueOptions, queue } from "./queue";

const queueTask = <P, R>(
	handler: Task<P, TestEvents, R>,
	concurrency?: number,
) => queue(handler, typeof concurrency === "number" ? { concurrency } : {});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("queue", () => {
	describe("order", () => {
		it("starts the first call synchronously", () => {
			const harness = createHarness();
			const handler = vi.fn();
			queueTask(handler)(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("makes the next call wait until the running one is done", async () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn((value: number) =>
				value === 1 ? gate.promise : value,
			);
			const queued = queueTask(handler);
			queued(1, harness.ctx());
			queued(2, harness.ctx());
			expect(handler).toHaveBeenCalledTimes(1);
			gate.resolve();
			await flush();

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);
		});

		it("runs calls in the order they arrived", async () => {
			const harness = createHarness();
			const order: number[] = [];
			const queued = queueTask(async (value: number) => {
				await new Promise((result) => setTimeout(result, 5 - value));
				order.push(value);
			});
			await Promise.all(
				[1, 2, 3, 4].map((value) => queued(value, harness.ctx())),
			);

			expect(order).toEqual([1, 2, 3, 4]);
		});

		it("runs one call at a time", async () => {
			const harness = createHarness();
			let running = 0;
			let max = 0;
			const queued = queueTask(async () => {
				running++;
				max = Math.max(max, running);
				await new Promise((result) => setTimeout(result, 2));
				running--;
			});
			await Promise.all([1, 2, 3, 4, 5].map(() => queued(0, harness.ctx())));

			expect(max).toBe(1);
		});

		it("gives every call the result of its own run", async () => {
			const harness = createHarness();
			const queued = queueTask(async (value: number) => value * 10);
			const results = await Promise.all(
				[1, 2, 3].map((value) => queued(value, harness.ctx())),
			);

			expect(results).toEqual([10, 20, 30]);
		});

		it("returns a promise for a sync fn too", async () => {
			const harness = createHarness();
			const result = queueTask((value: number) => value + 1)(1, harness.ctx());

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBe(2);
		});

		it("runs sync fns in order", async () => {
			const harness = createHarness();
			const order: number[] = [];
			const queued = queueTask((value: number) => {
				order.push(value);
			});
			await Promise.all([1, 2, 3].map((value) => queued(value, harness.ctx())));

			expect(order).toEqual([1, 2, 3]);
		});

		it("starts again at once after the queue went idle", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const queued = queueTask(handler);
			await queued(1, harness.ctx());
			queued(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("keeps separate instances independent", () => {
			const harness = createHarness();
			const gate = deferred();
			const first = queueTask(() => gate.promise);
			const second = vi.fn();
			first(1, harness.ctx());
			queueTask(second)(1, harness.ctx());

			expect(second).toHaveBeenCalledTimes(1);
			gate.resolve();
		});
	});

	describe("concurrency", () => {
		it("runs up to the limit at the same time", () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise(() => {}));
			const queued = queueTask(handler, 2);
			queued(1, harness.ctx());
			queued(2, harness.ctx());
			queued(3, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("starts a waiting call as soon as a slot frees up", async () => {
			const harness = createHarness();
			const firstGate = deferred();
			const handler = vi.fn((value: number) =>
				value === 1 ? firstGate.promise : new Promise(() => {}),
			);
			const queued = queueTask(handler, 2);
			queued(1, harness.ctx());
			queued(2, harness.ctx());
			queued(3, harness.ctx());
			firstGate.resolve();
			await flush();

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
		});

		it("never exceeds the limit", async () => {
			const harness = createHarness();
			let running = 0;
			let max = 0;
			const queued = queueTask(async () => {
				running++;
				max = Math.max(max, running);
				await new Promise((result) => setTimeout(result, 2));
				running--;
			}, 3);
			await Promise.all(
				Array.from({ length: 10 }, () => queued(0, harness.ctx())),
			);

			expect(max).toBe(3);
		});

		it("starts waiting calls in arrival order", async () => {
			const harness = createHarness();
			const started: number[] = [];
			const queued = queueTask(async (value: number) => {
				started.push(value);
				await new Promise((result) => setTimeout(result, 2));
			}, 2);
			await Promise.all(
				[1, 2, 3, 4, 5].map((value) => queued(value, harness.ctx())),
			);

			expect(started).toEqual([1, 2, 3, 4, 5]);
		});
	});

	describe("errors", () => {
		it("rejects the call whose run failed", async () => {
			const harness = createHarness();
			const queued = queueTask(async () => {
				throw new Error("boom");
			});

			await expect(queued(1, harness.ctx())).rejects.toThrow("boom");
		});

		it("turns a sync throw into a rejection", async () => {
			const harness = createHarness();
			const queued = queueTask(() => {
				throw new Error("boom");
			});
			let result: Promise<unknown> | null = null;

			expect(() => {
				result = queued(1, harness.ctx());
			}).not.toThrow();
			await expect(result).rejects.toThrow("boom");
		});

		it("keeps going after an error, and only that call fails", async () => {
			const harness = createHarness();
			const queued = queueTask(async (value: number) => {
				if (value === 2) {
					throw new Error("boom");
				}
				return value;
			});
			const results = await Promise.allSettled(
				[1, 2, 3].flatMap((value) => queued(value, harness.ctx())),
			);

			expect(results.map((result) => result.status)).toEqual([
				"fulfilled",
				"rejected",
				"fulfilled",
			]);
		});

		it("frees the slot after a sync throw", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => {
				if (value === 1) {
					throw new Error("boom");
				}
				return value;
			});
			const queued = queueTask(handler);
			const first = queued(1, harness.ctx());
			const second = queued(2, harness.ctx());

			await expect(first).rejects.toThrow("boom");
			await expect(second).resolves.toBe(2);
		});
	});

	describe("abort", () => {
		it("ignores a call whose task is already aborted", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			const handler = vi.fn();

			await expect(queueTask(handler)(1, ctx)).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
			expect(harness.phases()).toEqual([]);
		});

		it("skips a waiting call whose task aborts", async () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn((value: number) =>
				value === 1 ? gate.promise : value,
			);
			const queued = queueTask(handler);
			queued(1, harness.ctx());
			const waitingCtx = harness.ctx();
			const skipped = queued(2, waitingCtx);
			waitingCtx.abort();
			gate.resolve();

			await expect(skipped).resolves.toBeUndefined();
			await flush();
			expect(handler.mock.calls.map((call) => call[0])).toEqual([1]);
		});

		it("lets the call behind a skipped one run", async () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn((value: number) =>
				value === 1 ? gate.promise : value,
			);
			const queued = queueTask(handler);
			queued(1, harness.ctx());
			const waitingCtx = harness.ctx();
			queued(2, waitingCtx);
			const third = queued(3, harness.ctx());
			waitingCtx.abort();
			gate.resolve();

			await expect(third).resolves.toBe(3);
		});

		it("frees the slot when the running task aborts, and drops its result", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const gate = deferred<string>();
			const handler = vi.fn((value: number) =>
				value === 1 ? gate.promise : "second",
			);
			const queued = queueTask(handler);
			const first = queued(1, ctx);
			const second = queued(2, harness.ctx());
			ctx.abort();

			await expect(second).resolves.toBe("second");
			gate.resolve("late");
			await expect(first).resolves.toBeUndefined();
		});

		it("drops a rejection that comes after the abort", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const gate = deferred();
			const first = queueTask(() => gate.promise)(1, ctx);
			ctx.abort();
			gate.reject(new Error("late"));

			await expect(first).resolves.toBeUndefined();
		});

		it("a late finish of an aborted run does not free a slot twice", async () => {
			const harness = createHarness();
			const first = harness.ctx();
			const gateA = deferred();
			const gateB = deferred();
			const started: string[] = [];
			const queued = queueTask((name: string) => {
				started.push(name);
				return name === "a" ? gateA.promise : name === "b" ? gateB.promise : 0;
			});
			queued("a", first);
			queued("b", harness.ctx());
			queued("c", harness.ctx());
			first.abort();
			gateA.resolve();
			await flush();

			expect(started).toEqual(["a", "b"]);
			gateB.resolve();
			await flush();
			expect(started).toEqual(["a", "b", "c"]);
		});

		it("aborting after the run finished changes nothing", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const queued = queueTask((value: number) => value);
			await queued(1, ctx);
			ctx.abort();

			expect(harness.phases()).toEqual(["queue/start", "queue/done"]);
		});
	});

	describe("trace", () => {
		it("start and done for each call, one after the other", async () => {
			const harness = createHarness();
			const queued = queueTask(async () => {});
			await Promise.all([queued(1, harness.ctx()), queued(2, harness.ctx())]);

			expect(harness.phases()).toEqual([
				"queue/start",
				"queue/done",
				"queue/start",
				"queue/done",
			]);
		});

		it("reports nothing for a call while it waits", () => {
			const harness = createHarness();
			const queued = queueTask(() => new Promise(() => {}));
			queued(1, harness.ctx());
			queued(2, harness.ctx());

			expect(harness.phases()).toEqual(["queue/start"]);
		});

		it("reports a drop for a waiting call that aborts", () => {
			const harness = createHarness();
			const queued = queueTask(() => new Promise(() => {}));
			queued(1, harness.ctx());
			const waitingCtx = harness.ctx();
			queued(2, waitingCtx);
			waitingCtx.abort();

			expect(harness.phases()).toEqual(["queue/start", "queue/drop"]);
		});

		it("reports cancel for a running call that aborts", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			queueTask(() => new Promise(() => {}))(1, ctx);
			ctx.abort();

			expect(harness.phases()).toEqual(["queue/start", "queue/cancel"]);
		});

		it("reports an error", async () => {
			const harness = createHarness();
			await queueTask(async () => {
				throw new Error("boom");
			})(1, harness.ctx()).catch(() => {});

			expect(harness.phases()).toEqual(["queue/start", "queue/error"]);
		});
	});

	describe("on a bus", () => {
		it("handles a burst of emits one at a time, in order", async () => {
			const harness = createHarness();
			const order: number[] = [];
			let running = 0;
			let max = 0;
			harness.bus.on(
				"t",
				queueTask(async (value: number) => {
					running++;
					max = Math.max(max, running);
					await new Promise((result) => setTimeout(result, 2));
					order.push(value);
					running--;
				}),
			);
			for (const value of [1, 2, 3, 4]) {
				harness.bus.emit("t", value);
			}
			await new Promise((result) => setTimeout(result, 30));

			expect(order).toEqual([1, 2, 3, 4]);
			expect(max).toBe(1);
		});

		it("works with onError for a failing run", async () => {
			const onError = vi.fn();
			const bus = createBus<TestEvents>({ onError });
			bus.on(
				"t",
				queueTask(async () => {
					throw new Error("boom");
				}),
			);
			bus.emit("t", 1);
			await flush();

			expect(onError).toHaveBeenCalledTimes(1);
		});
	});

	describe("limit and overflow", () => {
		const queueLimited = <P, R>(
			handler: Task<P, TestEvents, R>,
			options: QueueOptions<P>,
		) => queue(handler, options);

		// a fn that records its payloads and finishes when its deferred resolves
		const gated = () => {
			const gates = new Map<number, Deferred<void>>();
			const started: number[] = [];
			const handler = (value: number) => {
				started.push(value);
				const gate = deferred();
				gates.set(value, gate);
				return gate.promise;
			};
			const release = async (value: number) => {
				gates.get(value)?.resolve(void 0);
				await flush();
			};
			return { fn: handler, started, release };
		};

		it("has no limit by default", async () => {
			const harness = createHarness();
			const { fn: handler, started, release } = gated();
			const queued = queueLimited(handler, {});
			for (let index = 1; index <= 20; index++) {
				queued(index, harness.ctx());
			}
			for (let index2 = 1; index2 <= 20; index2++) {
				await release(index2);
			}

			expect(started).toHaveLength(20);
		});

		it("drops a new call when the waiting line is full (default overflow)", async () => {
			const harness = createHarness();
			const { fn: handler, started, release } = gated();
			const queued = queueLimited(handler, { limit: 2 });
			queued(1, harness.ctx());
			queued(2, harness.ctx());
			queued(3, harness.ctx());
			const dropped = queued(4, harness.ctx());

			await expect(dropped).resolves.toBeUndefined();
			await release(1);
			await release(2);
			await release(3);
			expect(started).toEqual([1, 2, 3]);
		});

		it("reports a drop for the new call that did not fit", () => {
			const harness = createHarness();
			const queued = queueLimited(() => new Promise(() => {}), { limit: 1 });
			queued(1, harness.ctx());
			queued(2, harness.ctx());
			queued(3, harness.ctx());

			expect(harness.phases()).toEqual(["queue/start", "queue/drop"]);
		});

		it("with drop-old drops the oldest waiting call and keeps the new one", async () => {
			const harness = createHarness();
			const { fn: handler, started, release } = gated();
			const queued = queueLimited(handler, { limit: 1, overflow: "drop-old" });
			queued(1, harness.ctx());
			const old = queued(2, harness.ctx());
			queued(3, harness.ctx());

			await expect(old).resolves.toBeUndefined();
			await release(1);
			await release(3);
			expect(started).toEqual([1, 3]);
		});

		it("with drop-old keeps only the latest of a burst, in order", async () => {
			const harness = createHarness();
			const { fn: handler, started, release } = gated();
			const queued = queueLimited(handler, { limit: 2, overflow: "drop-old" });
			for (let index = 1; index <= 6; index++) {
				queued(index, harness.ctx());
			}
			await release(1);
			await release(5);
			await release(6);

			expect(started).toEqual([1, 5, 6]);
		});

		it("reports the drop on the dropped call's own task", () => {
			const harness = createHarness();
			const queued = queueLimited(() => new Promise(() => {}), {
				limit: 1,
				overflow: "drop-old",
			});
			queued(1, harness.ctx());
			const oldCtx = harness.ctx();
			queued(2, oldCtx);
			queued(3, harness.ctx());
			const drop = harness.recorder.events.find(
				(event) => event.phase === "drop",
			);

			expect(harness.phases()).toEqual(["queue/start", "queue/drop"]);
			expect(drop).toBeDefined();
		});

		it("a dropped call that aborts later changes nothing", () => {
			const harness = createHarness();
			const queued = queueLimited(() => new Promise(() => {}), {
				limit: 1,
				overflow: "drop-old",
			});
			queued(1, harness.ctx());
			const oldCtx = harness.ctx();
			queued(2, oldCtx);
			queued(3, harness.ctx());
			oldCtx.abort();

			expect(harness.phases()).toEqual(["queue/start", "queue/drop"]);
		});

		it("limit 0 means nothing waits, whatever the overflow", async () => {
			for (const overflow of ["drop-new", "drop-old"] as const) {
				const harness = createHarness();
				const handler = vi.fn(() => new Promise(() => {}));
				const queued = queueLimited(handler, { limit: 0, overflow });
				queued(1, harness.ctx());

				await expect(queued(2, harness.ctx())).resolves.toBeUndefined();
				expect(handler).toHaveBeenCalledTimes(1);
			}
		});

		it("does not count running calls against the limit", () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise(() => {}));
			const queued = queueLimited(handler, { concurrency: 2, limit: 1 });
			queued(1, harness.ctx());
			queued(2, harness.ctx());
			queued(3, harness.ctx());
			queued(4, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
			expect(harness.phases()).toEqual([
				"queue/start",
				"queue/start",
				"queue/drop",
			]);
		});

		it("an aborted waiting call frees its place in the line", async () => {
			const harness = createHarness();
			const { fn: handler, started, release } = gated();
			const queued = queueLimited(handler, { limit: 1 });
			queued(1, harness.ctx());
			const waitingCtx = harness.ctx();
			queued(2, waitingCtx);
			waitingCtx.abort();
			queued(3, harness.ctx());
			await release(1);
			await release(3);

			expect(started).toEqual([1, 3]);
		});

		it("starts at once when a slot is free, however small the limit", () => {
			const harness = createHarness();
			const handler = vi.fn();
			queueLimited(handler, { limit: 0 })(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("keeps only the latest event while one is running (patronum defer, #329)", async () => {
			vi.useFakeTimers();
			try {
				const harness = createHarness();
				const done: number[] = [];
				harness.bus.on(
					"t",
					queueLimited(
						async (value: number) => {
							await new Promise((result) => setTimeout(result, 100));
							done.push(value);
						},
						{ limit: 1, overflow: "drop-old" },
					),
				);
				harness.bus.emit("t", 1);
				harness.bus.emit("t", 2);
				harness.bus.emit("t", 3);
				harness.bus.emit("t", 4);
				await vi.advanceTimersByTimeAsync(500);

				expect(done).toEqual([1, 4]);
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
