import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../core/types";
import { latest } from "../policies";
import { createHarness, type TestEvents } from "../tests/test-helpers";
import { onAbort } from "../utils";
import { cancellable } from "./cancellable";

const latestTask = <P, R>(handler: Task<P, TestEvents, R>) => latest(handler);

describe("onAbort", () => {
	it("calls fn with the abort reason", () => {
		const controller = new AbortController();
		const handler = vi.fn();
		onAbort(controller, handler);
		controller.abort("stop");

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith("stop");
	});

	it("does not call fn before the abort", () => {
		const controller = new AbortController();
		const handler = vi.fn();
		onAbort(controller, handler);

		expect(handler).not.toHaveBeenCalled();
	});

	it("calls fn at once if already aborted", () => {
		const controller = new AbortController();
		controller.abort("early");
		const handler = vi.fn();
		onAbort(controller, handler);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith("early");
	});

	it("returns a callback that removes the subscription", () => {
		const controller = new AbortController();
		const handler = vi.fn();
		const off = onAbort(controller, handler);
		off();
		controller.abort();

		expect(handler).not.toHaveBeenCalled();
	});

	it("an unsubscribed callback is not called on abort, the others are", () => {
		const controller = new AbortController();
		const removed = vi.fn();
		const kept = vi.fn();
		const off = onAbort(controller, removed);
		onAbort(controller, kept);
		off();
		controller.abort();

		expect(removed).not.toHaveBeenCalled();
		expect(kept).toHaveBeenCalledTimes(1);
	});

	it("keeps calling the other callbacks when one throws, and logs it", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const controller = new AbortController();
		const after = vi.fn();
		onAbort(controller, () => {
			throw new Error("bad callback");
		});
		onAbort(controller, after);
		controller.abort();

		expect(after).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledTimes(1);
		error.mockRestore();
	});

	it("calls callbacks added after the abort at once, once each", () => {
		const controller = new AbortController();
		controller.abort("done");
		const handler = vi.fn();
		onAbort(controller, handler);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith("done");
	});

	it("handles many callbacks on one signal without slowing down", () => {
		const controller = new AbortController();
		const handler = vi.fn();
		const start = performance.now();
		const offs = Array.from({ length: 30_000 }, () =>
			onAbort(controller, handler),
		);
		for (const off of offs.reverse()) {
			off();
		}
		onAbort(controller, handler);
		controller.abort();

		expect(performance.now() - start).toBeLessThan(500);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("the same function subscribed twice is called twice", () => {
		const controller = new AbortController();
		const handler = vi.fn();
		onAbort(controller, handler);
		onAbort(controller, handler);
		controller.abort();

		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("off can be called twice, and after the abort", () => {
		const controller = new AbortController();
		const off = onAbort(controller, () => {});
		controller.abort();

		expect(() => {
			off();
			off();
		}).not.toThrow();
	});

	it("the off of an already aborted signal is a no-op", () => {
		const controller = new AbortController();
		controller.abort();
		const off = onAbort(controller, () => {});

		expect(() => off()).not.toThrow();
	});

	it("calls several subscribers in order", () => {
		const controller = new AbortController();
		const calls: string[] = [];
		onAbort(controller, () => calls.push("first"));
		onAbort(controller, () => calls.push("second"));
		controller.abort();

		expect(calls).toEqual(["first", "second"]);
	});

	it("does nothing without a context or a signal", () => {
		const handler = vi.fn();

		expect(() => {
			onAbort({}, handler)();
			onAbort({}, handler)();
		}).not.toThrow();
		expect(handler).not.toHaveBeenCalled();
	});

	it("accepts a task context", () => {
		const ctx = createHarness().ctx();
		const handler = vi.fn();
		onAbort(ctx, handler);
		ctx.abort("task gone");

		expect(handler).toHaveBeenCalledWith("task gone");
	});

	it("does not fire for a task that never aborts", () => {
		const ctx = createHarness().ctx();
		const handler = vi.fn();
		onAbort(ctx, handler);

		expect(handler).not.toHaveBeenCalled();
	});
});

describe("cancellable", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("settling", () => {
		it("resolves with the value", async () => {
			const controller = new AbortController();

			await expect(
				cancellable<number>(controller, ({ resolve }) => resolve(5)),
			).resolves.toBe(5);
		});

		it("resolves with a promise's value", async () => {
			const controller = new AbortController();

			await expect(
				cancellable<number>(controller, ({ resolve }) =>
					resolve(Promise.resolve(7)),
				),
			).resolves.toBe(7);
		});

		it("rejects with reject()", async () => {
			const controller = new AbortController();

			await expect(
				cancellable(controller, ({ reject }) => reject(new Error("boom"))),
			).rejects.toThrow("boom");
		});

		it("rejects when the executor throws", async () => {
			const controller = new AbortController();

			await expect(
				cancellable(controller, () => {
					throw new Error("boom");
				}),
			).rejects.toThrow("boom");
		});

		it("ignores later calls once settled", async () => {
			const controller = new AbortController();
			const promise = cancellable<number>(controller, ({ resolve, reject }) => {
				resolve(1);
				resolve(2);
				reject(new Error("late"));
			});

			await expect(promise).resolves.toBe(1);
		});

		it("a throw after resolve does not override the result", async () => {
			const controller = new AbortController();
			const promise = cancellable<number>(controller, ({ resolve }) => {
				resolve(1);
				throw new Error("late");
			});

			await expect(promise).resolves.toBe(1);
		});
	});

	describe("abort", () => {
		it("rejects with the abort reason", async () => {
			const controller = new AbortController();
			const promise = cancellable(controller, () => {});
			const assertion = expect(promise).rejects.toBe("stop");
			controller.abort("stop");

			await assertion;
		});

		it("rejects with the default reason when aborted without one", async () => {
			const controller = new AbortController();
			const promise = cancellable(controller, () => {});
			controller.abort();

			await expect(promise).rejects.toBe(controller.signal.reason);
		});

		it("does not run the executor if already aborted", async () => {
			const controller = new AbortController();
			controller.abort("early");
			const executor = vi.fn();

			await expect(cancellable(controller, executor)).rejects.toBe("early");
			expect(executor).not.toHaveBeenCalled();
		});

		it("runs the cleanups on abort, last registered first", async () => {
			const controller = new AbortController();
			const calls: string[] = [];
			const promise = cancellable(controller, ({ onCancel }) => {
				onCancel(() => calls.push("first"));
				onCancel(() => calls.push("second"));
			});
			const assertion = expect(promise).rejects.toBeDefined();
			controller.abort();
			await assertion;

			expect(calls).toEqual(["second", "first"]);
		});

		it("runs the cleanups before the rejection is observable", async () => {
			const controller = new AbortController();
			const calls: string[] = [];
			const promise = cancellable(controller, ({ onCancel }) => {
				onCancel(() => calls.push("cleanup"));
			}).catch(() => calls.push("rejected"));
			controller.abort();
			await promise;

			expect(calls).toEqual(["cleanup", "rejected"]);
		});

		it("runs each cleanup once", async () => {
			const controller = new AbortController();
			const cleanup = vi.fn();
			const promise = cancellable(controller, ({ onCancel }) => {
				onCancel(cleanup);
			});
			const assertion = expect(promise).rejects.toBeDefined();
			controller.abort();
			await assertion;

			expect(cleanup).toHaveBeenCalledTimes(1);
		});

		it("runs a cleanup registered after the abort at once", async () => {
			const controller = new AbortController();
			let register: (cleanup: () => void) => void = () => {};
			const promise = cancellable(controller, ({ onCancel }) => {
				register = onCancel;
			});
			const assertion = expect(promise).rejects.toBeDefined();
			controller.abort();
			await assertion;
			const cleanup = vi.fn();
			register(cleanup);

			expect(cleanup).toHaveBeenCalledTimes(1);
		});

		it("ignores a resolve after the abort", async () => {
			const controller = new AbortController();
			let finish: (value: number) => void = () => {};
			const promise = cancellable<number>(controller, ({ resolve }) => {
				finish = resolve;
			});
			const assertion = expect(promise).rejects.toBe("stop");
			controller.abort("stop");
			finish(1);

			await assertion;
		});

		it("keeps running the other cleanups if one throws, and logs it", async () => {
			const error = vi.spyOn(console, "error").mockImplementation(() => {});
			const controller = new AbortController();
			const after = vi.fn();
			const promise = cancellable(controller, ({ onCancel }) => {
				onCancel(after);
				onCancel(() => {
					throw new Error("cleanup failed");
				});
			});
			const assertion = expect(promise).rejects.toBe("stop");
			controller.abort("stop");
			await assertion;

			expect(after).toHaveBeenCalledTimes(1);
			expect(error).toHaveBeenCalledTimes(1);
		});
	});

	describe("after settling", () => {
		it("does not run the cleanups if it resolved first", async () => {
			const controller = new AbortController();
			const cleanup = vi.fn();
			const promise = cancellable<number>(
				controller,
				({ resolve, onCancel }) => {
					onCancel(cleanup);
					resolve(1);
				},
			);
			await promise;
			controller.abort();

			expect(cleanup).not.toHaveBeenCalled();
			await expect(promise).resolves.toBe(1);
		});

		it("does not run the cleanups if it rejected first", async () => {
			const controller = new AbortController();
			const cleanup = vi.fn();
			const promise = cancellable(controller, ({ reject, onCancel }) => {
				onCancel(cleanup);
				reject(new Error("boom"));
			});
			await promise.catch(() => {});
			controller.abort();

			expect(cleanup).not.toHaveBeenCalled();
		});

		it("drops a cleanup registered after it settled", async () => {
			const controller = new AbortController();
			let register: (cleanup: () => void) => void = () => {};
			await cancellable<number>(controller, ({ resolve, onCancel }) => {
				register = onCancel;
				resolve(1);
			});
			const cleanup = vi.fn();
			register(cleanup);
			controller.abort();

			expect(cleanup).not.toHaveBeenCalled();
		});

		it("stops listening once it settled: a later abort changes nothing", async () => {
			const controller = new AbortController();
			const cleanup = vi.fn();
			const result = await cancellable<number>(
				controller,
				({ resolve, onCancel }) => {
					onCancel(cleanup);
					resolve(1);
				},
			);
			controller.abort();

			expect(result).toBe(1);
			expect(cleanup).not.toHaveBeenCalled();
		});

		it("stops listening when the executor throws: a later abort changes nothing", async () => {
			const controller = new AbortController();
			const cleanup = vi.fn();
			await cancellable(controller, ({ onCancel }) => {
				onCancel(cleanup);
				throw new Error("boom");
			}).catch(() => {});
			controller.abort();

			expect(cleanup).not.toHaveBeenCalled();
		});
	});

	describe("with timers and tasks", () => {
		it("a timer example: abort clears the timer", async () => {
			const controller = new AbortController();
			const promise = cancellable<void>(controller, ({ resolve, onCancel }) => {
				const timer = setTimeout(resolve, 5000);
				onCancel(() => clearTimeout(timer));
			});
			const assertion = expect(promise).rejects.toBe("stop");
			expect(vi.getTimerCount()).toBe(1);
			controller.abort("stop");
			await assertion;

			expect(vi.getTimerCount()).toBe(0);
		});

		it("a timer example: finishing on its own leaves nothing behind", async () => {
			const controller = new AbortController();
			const promise = cancellable<void>(controller, ({ resolve, onCancel }) => {
				const timer = setTimeout(resolve, 5000);
				onCancel(() => clearTimeout(timer));
			});
			await vi.advanceTimersByTimeAsync(5000);
			await promise;

			expect(vi.getTimerCount()).toBe(0);
		});

		it("works with a task context", async () => {
			const ctx = createHarness().ctx();
			const promise = cancellable<void>(ctx, () => {});
			const assertion = expect(promise).rejects.toBe("gone");
			ctx.abort("gone");

			await assertion;
		});

		it("under latest, a superseded call clears its timer and drops the result", async () => {
			const harness = createHarness();
			const handler = latestTask((value: number, ctx) =>
				cancellable<number>(ctx, ({ resolve, onCancel }) => {
					const timer = setTimeout(() => resolve(value), 1000);
					onCancel(() => clearTimeout(timer));
				}),
			);
			const first = handler(1, harness.ctx());
			const second = handler(2, harness.ctx());
			expect(vi.getTimerCount()).toBe(1);
			await vi.advanceTimersByTimeAsync(1000);

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe(2);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("under latest, the trace shows the superseded call as cancelled", async () => {
			const harness = createHarness();
			const handler = latestTask((_: number, ctx) =>
				cancellable<void>(ctx, () => {}),
			);
			handler(1, harness.ctx());
			handler(2, harness.ctx());
			await Promise.resolve();

			expect(harness.phases()).toEqual([
				"latest/start",
				"latest/cancel",
				"latest/start",
			]);
		});
	});
});
