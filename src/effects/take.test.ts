import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness } from "../test-helpers";
import { delay } from "./index";
import { race } from "./race";
import { take } from "./take";
import { timeout } from "./timeout";

describe("take", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("result", () => {
		it("resolves with the payload of the next event", async () => {
			const h = createHarness();
			const promise = take(h.ctx(), "b");
			h.bus.emit("b", "hi");

			await expect(promise).resolves.toBe("hi");
		});

		it("ignores events emitted before the call", async () => {
			const h = createHarness();
			h.bus.emit("b", "old");
			const promise = take(h.ctx(), "b");
			h.bus.emit("b", "new");

			await expect(promise).resolves.toBe("new");
		});

		it("ignores other events", async () => {
			const h = createHarness();
			const promise = take(h.ctx(), "b");
			h.bus.emit("t", 1);
			h.bus.emit("b", "right");

			await expect(promise).resolves.toBe("right");
		});

		it("takes only the first event", async () => {
			const h = createHarness();
			const promise = take(h.ctx(), "b");
			h.bus.emit("b", "first");
			h.bus.emit("b", "second");

			await expect(promise).resolves.toBe("first");
		});

		it("unsubscribes once it has a value", async () => {
			const h = createHarness();
			const predicate = vi.fn(() => true);
			const promise = take(h.ctx(), "b", { predicate });
			h.bus.emit("b", "first");
			await promise;
			h.bus.emit("b", "second");
			h.bus.emit("b", "third");

			expect(predicate).toHaveBeenCalledTimes(1);
		});

		it("serves several waiters of the same event", async () => {
			const h = createHarness();
			const a = take(h.ctx(), "b");
			const b = take(h.ctx(), "b");
			h.bus.emit("b", "hi");

			await expect(Promise.all([a, b])).resolves.toEqual(["hi", "hi"]);
		});
	});

	describe("predicate", () => {
		it("waits for the first payload it accepts", async () => {
			const h = createHarness();
			const promise = take(h.ctx(), "t", { predicate: (n) => n > 2 });
			h.bus.emit("t", 1);
			h.bus.emit("t", 2);
			h.bus.emit("t", 3);
			h.bus.emit("t", 4);

			await expect(promise).resolves.toBe(3);
		});

		it("does not resolve while nothing matches", async () => {
			const h = createHarness();
			const done = vi.fn();
			take(h.ctx(), "t", { predicate: (n) => n > 10 }).then(done);
			h.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(10);

			expect(done).not.toHaveBeenCalled();
		});
	});

	describe("abort", () => {
		it("rejects with the reason when the task aborts", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const promise = take(ctx, "b");
			const assertion = expect(promise).rejects.toBe("stop");
			ctx.abort("stop");

			await assertion;
		});

		it("unsubscribes when the task aborts", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const predicate = vi.fn(() => true);
			const promise = take(ctx, "b", { predicate }).catch(() => {});
			ctx.abort();
			h.bus.emit("b", "late");
			await promise;

			expect(predicate).not.toHaveBeenCalled();
		});

		it("rejects at once if the task is already aborted, and does not subscribe", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			ctx.abort("early");
			const predicate = vi.fn(() => true);

			await expect(take(ctx, "b", { predicate })).rejects.toBe("early");
			h.bus.emit("b", "late");
			expect(predicate).not.toHaveBeenCalled();
		});

		it("rejects with the reason of options.signal and unsubscribes", async () => {
			const h = createHarness();
			const controller = new AbortController();
			const predicate = vi.fn(() => true);
			const promise = take(h.ctx(), "b", {
				signal: controller.signal,
				predicate,
			});
			const assertion = expect(promise).rejects.toBe("enough");
			controller.abort("enough");
			h.bus.emit("b", "late");

			await assertion;
			expect(predicate).not.toHaveBeenCalled();
		});

		it("does not abort the task when options.signal aborts", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const controller = new AbortController();
			const promise = take(ctx, "b", { signal: controller.signal }).catch(
				() => {},
			);
			controller.abort();
			await promise;

			expect(ctx.signal.aborted).toBe(false);
		});

		it("rejects at once if options.signal is already aborted", async () => {
			const h = createHarness();
			const controller = new AbortController();
			controller.abort("early");

			await expect(
				take(h.ctx(), "b", { signal: controller.signal }),
			).rejects.toBe("early");
		});

		it("ignores aborts after it has resolved", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const promise = take(ctx, "b");
			h.bus.emit("b", "hi");
			const value = await promise;
			ctx.abort();

			expect(value).toBe("hi");
			expect(h.phases()).toEqual(["take/start", "take/done"]);
		});
	});

	describe("with other effects", () => {
		it("race: when a timeout wins, the waiter is unsubscribed", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const predicate = vi.fn(() => true);
			const promise = race(ctx, {
				msg: ({ signal }) => take(ctx, "b", { signal, predicate }),
				late: ({ signal }) => delay({ signal }, 100),
			});
			await vi.advanceTimersByTimeAsync(100);
			const result = await promise;
			h.bus.emit("b", "too late");

			expect(result).toHaveProperty("late");
			expect(predicate).not.toHaveBeenCalled();
		});

		it("race: when the event wins, the timer is cleared", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const promise = race(ctx, {
				msg: ({ signal }) => take(ctx, "b", { signal }),
				late: ({ signal }) => delay({ signal }, 100),
			});
			h.bus.emit("b", "hi");

			await expect(promise).resolves.toEqual({ msg: "hi" });
			expect(vi.getTimerCount()).toBe(0);
		});

		it("timeout: gives up with a TimeoutError and unsubscribes", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const predicate = vi.fn(() => true);
			const promise = timeout(ctx, 100, ({ signal }) =>
				take(ctx, "b", { signal, predicate }),
			);
			const assertion = expect(promise).rejects.toHaveProperty(
				"name",
				"TimeoutError",
			);
			await vi.advanceTimersByTimeAsync(100);
			h.bus.emit("b", "late");

			await assertion;
			expect(predicate).not.toHaveBeenCalled();
		});

		it("works in a handler: wait for logout after login", async () => {
			const h = createHarness();
			const log: string[] = [];
			h.bus.on("t", async (n, ctx) => {
				log.push(`login ${n}`);
				const reason = await take(ctx, "b");
				log.push(`logout ${reason}`);
			});
			h.bus.emit("t", 1);
			h.bus.emit("b", "bye");
			await vi.advanceTimersByTimeAsync(0);

			expect(log).toEqual(["login 1", "logout bye"]);
		});
	});

	describe("trace", () => {
		it("start and done", async () => {
			const h = createHarness();
			const promise = take(h.ctx(), "b");
			h.bus.emit("b", "hi");
			await promise;

			expect(h.phases()).toEqual(["take/start", "take/done"]);
		});

		it("ends with cancel when the task aborts", async () => {
			const h = createHarness();
			const ctx = h.ctx();
			const promise = take(ctx, "b").catch(() => {});
			ctx.abort();
			await promise;

			expect(h.phases()).toEqual(["take/start", "take/cancel"]);
		});

		it("ends with error when options.signal aborts", async () => {
			const h = createHarness();
			const controller = new AbortController();
			const promise = take(h.ctx(), "b", { signal: controller.signal }).catch(
				() => {},
			);
			controller.abort("enough");
			await promise;

			expect(h.phases()).toEqual(["take/start", "take/error"]);
		});
	});
});
