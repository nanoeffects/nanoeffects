import { describe, expect, it, vi } from "vitest";
import { createBus } from "../bus";
import {
	createHarness,
	type Deferred,
	deferred,
	type TestEvents,
} from "../test-helpers";
import type { Task } from "../types";
import { queue } from "./queue";

const que = <P, R>(fn: Task<P, TestEvents, R>, concurrency?: number) =>
	queue(fn, typeof concurrency === "number" ? { concurrency } : {});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("queue", () => {
	describe("order", () => {
		it("starts the first call synchronously", () => {
			const h = createHarness();
			const fn = vi.fn();
			que(fn)(1, h.ctx());

			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("makes the next call wait until the running one is done", async () => {
			const h = createHarness();
			const d = deferred();
			const fn = vi.fn((n: number) => (n === 1 ? d.promise : n));
			const q = que(fn);
			q(1, h.ctx());
			q(2, h.ctx());
			expect(fn).toHaveBeenCalledTimes(1);
			d.resolve();
			await flush();

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2]);
		});

		it("runs calls in the order they arrived", async () => {
			const h = createHarness();
			const order: number[] = [];
			const q = que(async (n: number) => {
				await new Promise((r) => setTimeout(r, 5 - n));
				order.push(n);
			});
			await Promise.all([1, 2, 3, 4].map((n) => q(n, h.ctx())));

			expect(order).toEqual([1, 2, 3, 4]);
		});

		it("runs one call at a time", async () => {
			const h = createHarness();
			let running = 0;
			let max = 0;
			const q = que(async () => {
				running++;
				max = Math.max(max, running);
				await new Promise((r) => setTimeout(r, 2));
				running--;
			});
			await Promise.all([1, 2, 3, 4, 5].map(() => q(0, h.ctx())));

			expect(max).toBe(1);
		});

		it("gives every call the result of its own run", async () => {
			const h = createHarness();
			const q = que(async (n: number) => n * 10);
			const results = await Promise.all([1, 2, 3].map((n) => q(n, h.ctx())));

			expect(results).toEqual([10, 20, 30]);
		});

		it("returns a promise for a sync fn too", async () => {
			const h = createHarness();
			const result = que((n: number) => n + 1)(1, h.ctx());

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBe(2);
		});

		it("runs sync fns in order", async () => {
			const h = createHarness();
			const order: number[] = [];
			const q = que((n: number) => {
				order.push(n);
			});
			await Promise.all([1, 2, 3].map((n) => q(n, h.ctx())));

			expect(order).toEqual([1, 2, 3]);
		});

		it("starts again at once after the queue went idle", async () => {
			const h = createHarness();
			const fn = vi.fn();
			const q = que(fn);
			await q(1, h.ctx());
			q(2, h.ctx());

			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("keeps separate instances independent", () => {
			const h = createHarness();
			const d = deferred();
			const a = que(() => d.promise);
			const b = vi.fn();
			a(1, h.ctx());
			que(b)(1, h.ctx());

			expect(b).toHaveBeenCalledTimes(1);
			d.resolve();
		});
	});

	describe("concurrency", () => {
		it("runs up to the limit at the same time", () => {
			const h = createHarness();
			const fn = vi.fn(() => new Promise(() => {}));
			const q = que(fn, 2);
			q(1, h.ctx());
			q(2, h.ctx());
			q(3, h.ctx());

			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("starts a waiting call as soon as a slot frees up", async () => {
			const h = createHarness();
			const d1 = deferred();
			const fn = vi.fn((n: number) =>
				n === 1 ? d1.promise : new Promise(() => {}),
			);
			const q = que(fn, 2);
			q(1, h.ctx());
			q(2, h.ctx());
			q(3, h.ctx());
			d1.resolve();
			await flush();

			expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
		});

		it("never exceeds the limit", async () => {
			const h = createHarness();
			let running = 0;
			let max = 0;
			const q = que(async () => {
				running++;
				max = Math.max(max, running);
				await new Promise((r) => setTimeout(r, 2));
				running--;
			}, 3);
			await Promise.all(Array.from({ length: 10 }, () => q(0, h.ctx())));

			expect(max).toBe(3);
		});

		it("starts waiting calls in arrival order", async () => {
			const h = createHarness();
			const started: number[] = [];
			const q = que(async (n: number) => {
				started.push(n);
				await new Promise((r) => setTimeout(r, 2));
			}, 2);
			await Promise.all([1, 2, 3, 4, 5].map((n) => q(n, h.ctx())));

			expect(started).toEqual([1, 2, 3, 4, 5]);
		});
	});

	describe("errors", () => {
		it("rejects the call whose run failed", async () => {
			const h = createHarness();
			const q = que(async () => {
				throw new Error("boom");
			});

			await expect(q(1, h.ctx())).rejects.toThrow("boom");
		});

		it("turns a sync throw into a rejection", async () => {
			const h = createHarness();
			const q = que(() => {
				throw new Error("boom");
			});
			let result: Promise<unknown> | null = null;

			expect(() => {
				result = q(1, h.ctx());
			}).not.toThrow();
			await expect(result).rejects.toThrow("boom");
		});

		it("keeps going after an error, and only that call fails", async () => {
			const h = createHarness();
			const q = que(async (n: number) => {
				if (n === 2) {
					throw new Error("boom");
				}
				return n;
			});
			const results = await Promise.allSettled(
				[1, 2, 3].flatMap((n) => q(n, h.ctx())),
			);

			expect(results.map((r) => r.status)).toEqual([
				"fulfilled",
				"rejected",
				"fulfilled",
			]);
		});

		it("frees the slot after a sync throw", async () => {
			const h = createHarness();
			const fn = vi.fn((n: number) => {
				if (n === 1) {
					throw new Error("boom");
				}
				return n;
			});
			const q = que(fn);
			const first = q(1, h.ctx());
			const second = q(2, h.ctx());

			await expect(first).rejects.toThrow("boom");
			await expect(second).resolves.toBe(2);
		});
	});

	describe("abort", () => {
		it("ignores a call whose task is already aborted", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort();
			const fn = vi.fn();

			await expect(que(fn)(1, ctx)).resolves.toBeUndefined();
			expect(fn).not.toHaveBeenCalled();
			expect(h.phases()).toEqual([]);
		});

		it("skips a waiting call whose task aborts", async () => {
			const h = createHarness();
			const d = deferred();
			const fn = vi.fn((n: number) => (n === 1 ? d.promise : n));
			const q = que(fn);
			q(1, h.ctx());
			const waitingCtx = h.ctx();
			const skipped = q(2, waitingCtx);
			waitingCtx.abort();
			d.resolve();

			await expect(skipped).resolves.toBeUndefined();
			await flush();
			expect(fn.mock.calls.map((c) => c[0])).toEqual([1]);
		});

		it("lets the call behind a skipped one run", async () => {
			const h = createHarness();
			const d = deferred();
			const fn = vi.fn((n: number) => (n === 1 ? d.promise : n));
			const q = que(fn);
			q(1, h.ctx());
			const waitingCtx = h.ctx();
			q(2, waitingCtx);
			const third = q(3, h.ctx());
			waitingCtx.abort();
			d.resolve();

			await expect(third).resolves.toBe(3);
		});

		it("frees the slot when the running task aborts, and drops its result", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const d = deferred<string>();
			const fn = vi.fn((n: number) => (n === 1 ? d.promise : "second"));
			const q = que(fn);
			const first = q(1, ctx);
			const second = q(2, h.ctx());
			ctx.abort();

			await expect(second).resolves.toBe("second");
			d.resolve("late");
			await expect(first).resolves.toBeUndefined();
		});

		it("drops a rejection that comes after the abort", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const d = deferred();
			const first = que(() => d.promise)(1, ctx);
			ctx.abort();
			d.reject(new Error("late"));

			await expect(first).resolves.toBeUndefined();
		});

		it("a late finish of an aborted run does not free a slot twice", async () => {
			const h = createHarness();
			const a = h.ctx();
			const dA = deferred();
			const dB = deferred();
			const started: string[] = [];
			const q = que((name: string) => {
				started.push(name);
				return name === "a" ? dA.promise : name === "b" ? dB.promise : 0;
			});
			q("a", a);
			q("b", h.ctx());
			q("c", h.ctx());
			a.abort();
			dA.resolve();
			await flush();

			expect(started).toEqual(["a", "b"]);
			dB.resolve();
			await flush();
			expect(started).toEqual(["a", "b", "c"]);
		});

		it("aborting after the run finished changes nothing", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const q = que((n: number) => n);
			await q(1, ctx);
			ctx.abort();

			expect(h.phases()).toEqual(["queue/start", "queue/done"]);
		});
	});

	describe("trace", () => {
		it("start and done for each call, one after the other", async () => {
			const h = createHarness();
			const q = que(async () => {});
			await Promise.all([q(1, h.ctx()), q(2, h.ctx())]);

			expect(h.phases()).toEqual([
				"queue/start",
				"queue/done",
				"queue/start",
				"queue/done",
			]);
		});

		it("reports nothing for a call while it waits", () => {
			const h = createHarness();
			const q = que(() => new Promise(() => {}));
			q(1, h.ctx());
			q(2, h.ctx());

			expect(h.phases()).toEqual(["queue/start"]);
		});

		it("reports a drop for a waiting call that aborts", () => {
			const h = createHarness();
			const q = que(() => new Promise(() => {}));
			q(1, h.ctx());
			const waitingCtx = h.ctx();
			q(2, waitingCtx);
			waitingCtx.abort();

			expect(h.phases()).toEqual(["queue/start", "queue/drop"]);
		});

		it("reports cancel for a running call that aborts", () => {
			const h = createHarness();
			const ctx = h.ctx();
			que(() => new Promise(() => {}))(1, ctx);
			ctx.abort();

			expect(h.phases()).toEqual(["queue/start", "queue/cancel"]);
		});

		it("reports an error", async () => {
			const h = createHarness();
			await que(async () => {
				throw new Error("boom");
			})(1, h.ctx()).catch(() => {});

			expect(h.phases()).toEqual(["queue/start", "queue/error"]);
		});
	});

	describe("on a bus", () => {
		it("handles a burst of emits one at a time, in order", async () => {
			const h = createHarness();
			const order: number[] = [];
			let running = 0;
			let max = 0;
			h.bus.on(
				"t",
				que(async (n: number) => {
					running++;
					max = Math.max(max, running);
					await new Promise((r) => setTimeout(r, 2));
					order.push(n);
					running--;
				}),
			);
			for (const n of [1, 2, 3, 4]) {
				h.bus.emit("t", n);
			}
			await new Promise((r) => setTimeout(r, 30));

			expect(order).toEqual([1, 2, 3, 4]);
			expect(max).toBe(1);
		});

		it("works with onError for a failing run", async () => {
			const onError = vi.fn();
			const bus = createBus<TestEvents>({ onError });
			bus.on(
				"t",
				que(async () => {
					throw new Error("boom");
				}),
			);
			bus.emit("t", 1);
			await flush();

			expect(onError).toHaveBeenCalledTimes(1);
		});
	});

	describe("limit and overflow", () => {
		const limited = <P, R>(
			fn: Task<P, TestEvents, R>,
			options: Parameters<typeof queue>[1],
		) => queue(fn, options);

		// a fn that records its payloads and finishes when its deferred resolves
		const gated = () => {
			const gates = new Map<number, Deferred<void>>();
			const started: number[] = [];
			const fn = (n: number) => {
				started.push(n);
				const gate = deferred();
				gates.set(n, gate);
				return gate.promise;
			};
			const release = async (n: number) => {
				gates.get(n)?.resolve(void 0);
				await flush();
			};
			return { fn, started, release };
		};

		it("has no limit by default", async () => {
			const h = createHarness();
			const { fn, started, release } = gated();
			const q = limited(fn, {});
			for (let n = 1; n <= 20; n++) {
				q(n, h.ctx());
			}
			for (let n = 1; n <= 20; n++) {
				await release(n);
			}

			expect(started).toHaveLength(20);
		});

		it("drops a new call when the waiting line is full (default overflow)", async () => {
			const h = createHarness();
			const { fn, started, release } = gated();
			const q = limited(fn, { limit: 2 });
			q(1, h.ctx());
			q(2, h.ctx());
			q(3, h.ctx());
			const dropped = q(4, h.ctx());

			await expect(dropped).resolves.toBeUndefined();
			await release(1);
			await release(2);
			await release(3);
			expect(started).toEqual([1, 2, 3]);
		});

		it("reports a drop for the new call that did not fit", () => {
			const h = createHarness();
			const q = limited(() => new Promise(() => {}), { limit: 1 });
			q(1, h.ctx());
			q(2, h.ctx());
			q(3, h.ctx());

			expect(h.phases()).toEqual(["queue/start", "queue/drop"]);
		});

		it("with drop-old drops the oldest waiting call and keeps the new one", async () => {
			const h = createHarness();
			const { fn, started, release } = gated();
			const q = limited(fn, { limit: 1, overflow: "drop-old" });
			q(1, h.ctx());
			const old = q(2, h.ctx());
			q(3, h.ctx());

			await expect(old).resolves.toBeUndefined();
			await release(1);
			await release(3);
			expect(started).toEqual([1, 3]);
		});

		it("with drop-old keeps only the latest of a burst, in order", async () => {
			const h = createHarness();
			const { fn, started, release } = gated();
			const q = limited(fn, { limit: 2, overflow: "drop-old" });
			for (let n = 1; n <= 6; n++) {
				q(n, h.ctx());
			}
			await release(1);
			await release(5);
			await release(6);

			expect(started).toEqual([1, 5, 6]);
		});

		it("reports the drop on the dropped call's own task", () => {
			const h = createHarness();
			const q = limited(() => new Promise(() => {}), {
				limit: 1,
				overflow: "drop-old",
			});
			q(1, h.ctx());
			const oldCtx = h.ctx();
			q(2, oldCtx);
			q(3, h.ctx());
			const drop = h.recorder.events.find((e) => e.phase === "drop");

			expect(h.phases()).toEqual(["queue/start", "queue/drop"]);
			expect(drop).toBeDefined();
		});

		it("a dropped call that aborts later changes nothing", () => {
			const h = createHarness();
			const q = limited(() => new Promise(() => {}), {
				limit: 1,
				overflow: "drop-old",
			});
			q(1, h.ctx());
			const oldCtx = h.ctx();
			q(2, oldCtx);
			q(3, h.ctx());
			oldCtx.abort();

			expect(h.phases()).toEqual(["queue/start", "queue/drop"]);
		});

		it("limit 0 means nothing waits, whatever the overflow", async () => {
			for (const overflow of ["drop-new", "drop-old"] as const) {
				const h = createHarness();
				const fn = vi.fn(() => new Promise(() => {}));
				const q = limited(fn, { limit: 0, overflow });
				q(1, h.ctx());

				await expect(q(2, h.ctx())).resolves.toBeUndefined();
				expect(fn).toHaveBeenCalledTimes(1);
			}
		});

		it("does not count running calls against the limit", () => {
			const h = createHarness();
			const fn = vi.fn(() => new Promise(() => {}));
			const q = limited(fn, { concurrency: 2, limit: 1 });
			q(1, h.ctx());
			q(2, h.ctx());
			q(3, h.ctx());
			q(4, h.ctx());

			expect(fn).toHaveBeenCalledTimes(2);
			expect(h.phases()).toEqual(["queue/start", "queue/start", "queue/drop"]);
		});

		it("an aborted waiting call frees its place in the line", async () => {
			const h = createHarness();
			const { fn, started, release } = gated();
			const q = limited(fn, { limit: 1 });
			q(1, h.ctx());
			const waitingCtx = h.ctx();
			q(2, waitingCtx);
			waitingCtx.abort();
			q(3, h.ctx());
			await release(1);
			await release(3);

			expect(started).toEqual([1, 3]);
		});

		it("starts at once when a slot is free, however small the limit", () => {
			const h = createHarness();
			const fn = vi.fn();
			limited(fn, { limit: 0 })(1, h.ctx());

			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("keeps only the latest event while one is running (patronum defer, #329)", async () => {
			vi.useFakeTimers();
			try {
				const h = createHarness();
				const done: number[] = [];
				h.bus.on(
					"t",
					limited(
						async (n: number) => {
							await new Promise((r) => setTimeout(r, 100));
							done.push(n);
						},
						{ limit: 1, overflow: "drop-old" },
					),
				);
				h.bus.emit("t", 1);
				h.bus.emit("t", 2);
				h.bus.emit("t", 3);
				h.bus.emit("t", 4);
				await vi.advanceTimersByTimeAsync(500);

				expect(done).toEqual([1, 4]);
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
