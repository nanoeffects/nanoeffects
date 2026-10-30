import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	noPayload,
	type TestEvents,
} from "../tests/test-helpers";
import { type DebounceOptions, debounce } from "./debounce";

const debounceTask = <P, R>(ms: number, handler: Task<P, TestEvents, R>) =>
	debounce(ms, handler);

describe("debounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("timing", () => {
		it("does not run before the quiet period ends", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			debounceTask(100, handler)(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(99);

			expect(handler).not.toHaveBeenCalled();
		});

		it("runs once the quiet period ends", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			debounceTask(100, handler)(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe(1);
		});

		it("restarts the wait on every new call", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceTask(100, handler);
			debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(99);
			debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(99);
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe(2);
		});

		it("runs only the last of many rapid calls", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceTask(100, handler);
			for (let index = 1; index <= 50; index++) {
				debounced(index, harness.ctx());
				await vi.advanceTimersByTimeAsync(10);
			}
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe(50);
		});

		it("starts a new wait for a call after the previous one ran", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceTask(100, handler);
			debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);
		});

		it("works with a zero delay", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceTask(0, handler);
			debounced(1, harness.ctx());
			debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(0);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe(2);
		});

		it("works with a void payload", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceTask(100, handler);
			debounced(noPayload, harness.ctx());
			debounced(noPayload, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("keeps separate instances independent", async () => {
			const harness = createHarness();
			const first = vi.fn();
			const second = vi.fn();
			debounceTask(100, first)(1, harness.ctx());
			debounceTask(100, second)(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(first).toHaveBeenCalledTimes(1);
			expect(second).toHaveBeenCalledTimes(1);
		});

		it("leaves no timers behind once settled", async () => {
			const harness = createHarness();
			const debounced = debounceTask(100, () => 1);
			debounced(1, harness.ctx());
			debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("results", () => {
		it("resolves with the result of the last call", async () => {
			const harness = createHarness();
			const promise = debounceTask(100, (value: number) => value * 2)(
				4,
				harness.ctx(),
			);
			await vi.advanceTimersByTimeAsync(100);

			await expect(promise).resolves.toBe(8);
		});

		it("resolves a replaced call with undefined", async () => {
			const harness = createHarness();
			const debounced = debounceTask(100, (value: number) => value);
			const first = debounced(1, harness.ctx());
			const second = debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe(2);
		});

		it("awaits an async fn", async () => {
			const harness = createHarness();
			const promise = debounceTask(100, async (value: number) => value + 1)(
				1,
				harness.ctx(),
			);
			await vi.advanceTimersByTimeAsync(100);

			await expect(promise).resolves.toBe(2);
		});
	});

	describe("errors", () => {
		it("rejects with a sync error of fn", async () => {
			const harness = createHarness();
			const promise = debounceTask(100, () => {
				throw new Error("boom");
			})(1, harness.ctx());
			const assertion = expect(promise).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		});

		it("rejects with an async error of fn", async () => {
			const harness = createHarness();
			const promise = debounceTask(100, async () => {
				throw new Error("boom");
			})(1, harness.ctx());
			const assertion = expect(promise).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		});

		it("works again after an error", async () => {
			const harness = createHarness();
			const debounced = debounceTask(100, (value: number) => {
				if (value === 1) {
					throw new Error("boom");
				}
				return value;
			});
			const failing = debounced(1, harness.ctx());
			const assertion = expect(failing).rejects.toThrow("boom");
			await vi.advanceTimersByTimeAsync(100);
			await assertion;
			const ok = debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(ok).resolves.toBe(2);
		});
	});

	describe("abort", () => {
		it("does not run when the task is already aborted", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			const handler = vi.fn();

			expect(debounceTask(100, handler)(1, ctx)).toBeUndefined();
			await vi.advanceTimersByTimeAsync(100);
			expect(handler).not.toHaveBeenCalled();
		});

		it("does not run when the task is aborted during the wait", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn();
			const promise = debounceTask(100, handler)(1, ctx);
			await vi.advanceTimersByTimeAsync(50);
			ctx.abort();
			await vi.advanceTimersByTimeAsync(100);

			await expect(promise).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});

		it("clears the timer when the task is aborted during the wait", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			debounceTask(100, () => 1)(1, ctx);
			ctx.abort();

			expect(vi.getTimerCount()).toBe(0);
		});

		it("aborts a running fn when a new call arrives", async () => {
			const harness = createHarness();
			const gate = deferred();
			const signals: AbortSignal[] = [];
			const debounced = debounceTask(100, (_: number, ctx) => {
				signals.push(ctx.signal);
				return gate.promise;
			});
			debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			expect(signals[0]?.aborted).toBe(false);
			debounced(2, harness.ctx());

			expect(signals[0]?.aborted).toBe(true);
			gate.resolve();
		});

		it("drops the result of a run that was superseded in flight", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const debounced = debounceTask(100, (value: number) =>
				value === 1 ? gate.promise : "second",
			);
			const first = debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			debounced(2, harness.ctx());
			gate.resolve("first");
			await vi.advanceTimersByTimeAsync(100);

			await expect(first).resolves.toBeUndefined();
		});

		it("aborts a running fn when the task aborts", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const signals: AbortSignal[] = [];
			debounceTask(100, (_: number, ctx) => {
				signals.push(ctx.signal);
				return new Promise(() => {});
			})(1, ctx);
			await vi.advanceTimersByTimeAsync(100);
			ctx.abort("gone");

			expect(signals[0]?.aborted).toBe(true);
			expect(signals[0]?.reason).toBe("gone");
		});

		it("a self-abort inside fn does not block later calls (saga #2313)", async () => {
			const harness = createHarness();
			const handler = vi.fn((_: number, ctx: { abort: () => void }) =>
				ctx.abort(),
			);
			harness.bus.on("t", debounceTask(100, handler));
			harness.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(100);
			harness.bus.emit("t", 2);
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("trace", () => {
		it("start and done for a call that ran", async () => {
			const harness = createHarness();
			debounceTask(100, () => 1)(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(harness.phases()).toEqual(["debounce/start", "debounce/done"]);
		});

		it("reports nothing before the wait ends", async () => {
			const harness = createHarness();
			debounceTask(100, () => 1)(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(50);

			expect(harness.phases()).toEqual([]);
		});

		it("drops a replaced call that never started", async () => {
			const harness = createHarness();
			const debounced = debounceTask(100, () => 1);
			debounced(1, harness.ctx());
			debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(harness.phases()).toEqual([
				"debounce/drop",
				"debounce/start",
				"debounce/done",
			]);
		});

		it("cancels (not drops) a call replaced after it started", async () => {
			const harness = createHarness();
			const debounced = debounceTask(100, () => new Promise(() => {}));
			debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			debounced(2, harness.ctx());

			expect(harness.phases()).toEqual(["debounce/start", "debounce/cancel"]);
		});

		it("drops every call but the last in a burst", async () => {
			const harness = createHarness();
			const debounced = debounceTask(100, () => 1);
			for (let index = 0; index < 5; index++) {
				debounced(index, harness.ctx());
			}
			await vi.advanceTimersByTimeAsync(100);
			const phases = harness.phases();

			expect(phases.filter((phase) => phase === "debounce/drop")).toHaveLength(
				4,
			);
			expect(phases.filter((phase) => phase === "debounce/start")).toHaveLength(
				1,
			);
			expect(phases.filter((phase) => phase === "debounce/done")).toHaveLength(
				1,
			);
		});

		it("drops a call whose task was aborted during the wait", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			debounceTask(100, () => 1)(1, ctx);
			ctx.abort();

			expect(harness.phases()).toEqual(["debounce/drop"]);
		});

		it("reports an error", async () => {
			const harness = createHarness();
			const promise = debounceTask(100, () => {
				throw new Error("boom");
			})(1, harness.ctx());
			const assertion = expect(promise).rejects.toThrow();
			await vi.advanceTimersByTimeAsync(100);
			await assertion;

			expect(harness.phases()).toEqual(["debounce/start", "debounce/error"]);
		});
	});

	describe("on a bus", () => {
		it("runs the last emit of a burst", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("t", debounceTask(100, handler));
			harness.bus.emit("t", 1);
			harness.bus.emit("t", 2);
			harness.bus.emit("t", 3);
			await vi.advanceTimersByTimeAsync(100);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe(3);
		});
	});

	describe("leading and trailing options", () => {
		const debounceWith = <P, R>(
			handler: Task<P, TestEvents, R>,
			options: DebounceOptions<P>,
		) => debounce(100, handler, options);

		it("leading runs the first call of a burst at once", () => {
			const harness = createHarness();
			const handler = vi.fn();
			debounceWith(handler, { leading: true })(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe(1);
		});

		it("leading alone runs a single call once, with no trailing repeat", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			debounceWith(handler, { leading: true })(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("leading and trailing: the rest of the burst runs once, with the last payload", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceWith(handler, { leading: true });
			debounced(1, harness.ctx());
			debounced(2, harness.ctx());
			debounced(3, harness.ctx());
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 3]);
		});

		it("leading and trailing: a call after the quiet period leads again", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceWith(handler, { leading: true });
			debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			debounced(2, harness.ctx());

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);
		});

		it("leading, trailing: false runs only the first call of a burst", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceWith(handler, {
				leading: true,
				trailing: false,
			});
			debounced(1, harness.ctx());
			debounced(2, harness.ctx());
			debounced(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1]);
		});

		it("leading, trailing: false: each call extends the burst", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceWith(handler, {
				leading: true,
				trailing: false,
			});
			debounced(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(60);
			debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(60);
			debounced(3, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);
			debounced(4, harness.ctx());

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 4]);
		});

		it("both false: nothing runs", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceWith(handler, { trailing: false });
			debounced(1, harness.ctx());
			debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(handler).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});

		it("the leading call returns the result of fn", async () => {
			const harness = createHarness();
			const debounced = debounceWith(async (value: number) => value * 2, {
				leading: true,
			});

			await expect(debounced(4, harness.ctx())).resolves.toBe(8);
		});

		it("a leading error rejects that call, and the burst goes on", async () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => {
				if (value === 1) {
					throw new Error("boom");
				}
				return value;
			});
			const debounced = debounceWith(handler, { leading: true });

			expect(() => debounced(1, harness.ctx())).toThrow("boom");
			const last = debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			await expect(last).resolves.toBe(2);
		});

		it("the leading call runs on the task's own context and is not aborted by later calls", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const signals: AbortSignal[] = [];
			const debounced = debounceWith(
				(_: number, ctx) => {
					signals.push(ctx.signal);
					return new Promise(() => {});
				},
				{ leading: true },
			);
			debounced(1, ctx);
			debounced(2, harness.ctx());

			expect(signals[0]).toBe(ctx.signal);
			expect(signals[0]?.aborted).toBe(false);
		});

		it("a burst whose waiting call is aborted ends, so the next call leads", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn();
			const debounced = debounceWith(handler, { leading: true });
			debounced(1, ctx);
			ctx.abort();
			debounced(2, harness.ctx());

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2]);
		});

		it("a superseded wait does not end the burst", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const debounced = debounceWith(handler, { leading: true });
			debounced(1, harness.ctx());
			debounced(2, harness.ctx());
			debounced(3, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("traces the leading run as start, done and the first wait as a drop", async () => {
			const harness = createHarness();
			debounceWith(() => 1, { leading: true })(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(harness.phases()).toEqual([
				"debounce/start",
				"debounce/done",
				"debounce/drop",
			]);
		});

		it("traces the trailing run after the leading one", async () => {
			const harness = createHarness();
			const debounced = debounceWith(() => 1, { leading: true });
			debounced(1, harness.ctx());
			debounced(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(100);

			expect(harness.phases()).toEqual([
				"debounce/start",
				"debounce/done",
				"debounce/drop",
				"debounce/start",
				"debounce/done",
			]);
		});

		it("ignores a call whose task is already aborted", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			const handler = vi.fn();

			expect(debounceWith(handler, { leading: true })(1, ctx)).toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});
	});
});
