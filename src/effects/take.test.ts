import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness } from "../tests/test-helpers";
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
			const harness = createHarness();
			const promise = take(harness.ctx(), "b");
			harness.bus.emit("b", "hi");

			await expect(promise).resolves.toBe("hi");
		});

		it("ignores events emitted before the call", async () => {
			const harness = createHarness();
			harness.bus.emit("b", "old");
			const promise = take(harness.ctx(), "b");
			harness.bus.emit("b", "new");

			await expect(promise).resolves.toBe("new");
		});

		it("ignores other events", async () => {
			const harness = createHarness();
			const promise = take(harness.ctx(), "b");
			harness.bus.emit("t", 1);
			harness.bus.emit("b", "right");

			await expect(promise).resolves.toBe("right");
		});

		it("takes only the first event", async () => {
			const harness = createHarness();
			const promise = take(harness.ctx(), "b");
			harness.bus.emit("b", "first");
			harness.bus.emit("b", "second");

			await expect(promise).resolves.toBe("first");
		});

		it("unsubscribes once it has a value", async () => {
			const harness = createHarness();
			const predicate = vi.fn(() => true);
			const promise = take(harness.ctx(), "b", { predicate });
			harness.bus.emit("b", "first");
			await promise;
			harness.bus.emit("b", "second");
			harness.bus.emit("b", "third");

			expect(predicate).toHaveBeenCalledTimes(1);
		});

		it("serves several waiters of the same event", async () => {
			const harness = createHarness();
			const first = take(harness.ctx(), "b");
			const second = take(harness.ctx(), "b");
			harness.bus.emit("b", "hi");

			await expect(Promise.all([first, second])).resolves.toEqual(["hi", "hi"]);
		});
	});

	describe("predicate", () => {
		it("waits for the first payload it accepts", async () => {
			const harness = createHarness();
			const promise = take(harness.ctx(), "t", {
				predicate: (value) => value > 2,
			});
			harness.bus.emit("t", 1);
			harness.bus.emit("t", 2);
			harness.bus.emit("t", 3);
			harness.bus.emit("t", 4);

			await expect(promise).resolves.toBe(3);
		});

		it("does not resolve while nothing matches", async () => {
			const harness = createHarness();
			const done = vi.fn();
			take(harness.ctx(), "t", { predicate: (value) => value > 10 }).then(done);
			harness.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(10);

			expect(done).not.toHaveBeenCalled();
		});
	});

	describe("abort", () => {
		it("rejects with the reason when the task aborts", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = take(ctx, "b");
			const assertion = expect(promise).rejects.toBe("stop");
			ctx.abort("stop");

			await assertion;
		});

		it("unsubscribes when the task aborts", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const predicate = vi.fn(() => true);
			const promise = take(ctx, "b", { predicate }).catch(() => {});
			ctx.abort();
			harness.bus.emit("b", "late");
			await promise;

			expect(predicate).not.toHaveBeenCalled();
		});

		it("rejects at once if the task is already aborted, and does not subscribe", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort("early");
			const predicate = vi.fn(() => true);

			await expect(take(ctx, "b", { predicate })).rejects.toBe("early");
			harness.bus.emit("b", "late");
			expect(predicate).not.toHaveBeenCalled();
		});

		it("rejects with the reason of options.signal and unsubscribes", async () => {
			const harness = createHarness();
			const controller = new AbortController();
			const predicate = vi.fn(() => true);
			const promise = take(harness.ctx(), "b", {
				signal: controller.signal,
				predicate,
			});
			const assertion = expect(promise).rejects.toBe("enough");
			controller.abort("enough");
			harness.bus.emit("b", "late");

			await assertion;
			expect(predicate).not.toHaveBeenCalled();
		});

		it("does not abort the task when options.signal aborts", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const controller = new AbortController();
			const promise = take(ctx, "b", { signal: controller.signal }).catch(
				() => {},
			);
			controller.abort();
			await promise;

			expect(ctx.signal.aborted).toBe(false);
		});

		it("rejects at once if options.signal is already aborted", async () => {
			const harness = createHarness();
			const controller = new AbortController();
			controller.abort("early");

			await expect(
				take(harness.ctx(), "b", { signal: controller.signal }),
			).rejects.toBe("early");
		});

		it("ignores aborts after it has resolved", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = take(ctx, "b");
			harness.bus.emit("b", "hi");
			const value = await promise;
			ctx.abort();

			expect(value).toBe("hi");
			expect(harness.phases()).toEqual(["take/start", "take/done"]);
		});
	});

	describe("with other effects", () => {
		it("race: when a timeout wins, the waiter is unsubscribed", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const predicate = vi.fn(() => true);
			const promise = race(ctx, {
				msg: ({ signal }) => take(ctx, "b", { signal, predicate }),
				late: ({ signal }) => delay({ signal }, 100),
			});
			await vi.advanceTimersByTimeAsync(100);
			const result = await promise;
			harness.bus.emit("b", "too late");

			expect(result).toHaveProperty("late");
			expect(predicate).not.toHaveBeenCalled();
		});

		it("race: when the event wins, the timer is cleared", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = race(ctx, {
				msg: ({ signal }) => take(ctx, "b", { signal }),
				late: ({ signal }) => delay({ signal }, 100),
			});
			harness.bus.emit("b", "hi");

			await expect(promise).resolves.toEqual({ msg: "hi" });
			expect(vi.getTimerCount()).toBe(0);
		});

		it("timeout: gives up with a TimeoutError and unsubscribes", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const predicate = vi.fn(() => true);
			const promise = timeout(ctx, 100, ({ signal }) =>
				take(ctx, "b", { signal, predicate }),
			);
			const assertion = expect(promise).rejects.toHaveProperty(
				"name",
				"TimeoutError",
			);
			await vi.advanceTimersByTimeAsync(100);
			harness.bus.emit("b", "late");

			await assertion;
			expect(predicate).not.toHaveBeenCalled();
		});

		it("works in a handler: wait for logout after login", async () => {
			const harness = createHarness();
			const log: string[] = [];
			harness.bus.on("t", async (value, ctx) => {
				log.push(`login ${value}`);
				const reason = await take(ctx, "b");
				log.push(`logout ${reason}`);
			});
			harness.bus.emit("t", 1);
			harness.bus.emit("b", "bye");
			await vi.advanceTimersByTimeAsync(0);

			expect(log).toEqual(["login 1", "logout bye"]);
		});
	});

	describe("trace", () => {
		it("start and done", async () => {
			const harness = createHarness();
			const promise = take(harness.ctx(), "b");
			harness.bus.emit("b", "hi");
			await promise;

			expect(harness.phases()).toEqual(["take/start", "take/done"]);
		});

		it("ends with cancel when the task aborts", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const promise = take(ctx, "b").catch(() => {});
			ctx.abort();
			await promise;

			expect(harness.phases()).toEqual(["take/start", "take/cancel"]);
		});

		it("ends with error when options.signal aborts", async () => {
			const harness = createHarness();
			const controller = new AbortController();
			const promise = take(harness.ctx(), "b", {
				signal: controller.signal,
			}).catch(() => {});
			controller.abort("enough");
			await promise;

			expect(harness.phases()).toEqual(["take/start", "take/error"]);
		});
	});
});
