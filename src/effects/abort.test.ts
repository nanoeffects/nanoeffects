import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { latest } from "../policies";
import { createHarness, type TestEvents } from "../test-helpers";
import type { Task } from "../types";
import { cancellable } from "./cancellable";
import { onAbort } from "./onAbort";

const lat = <P, R>(fn: Task<P, TestEvents, R>) => latest(fn);

describe("onAbort", () => {
	it("calls fn with the abort reason", () => {
		const controller = new AbortController();
		const fn = vi.fn();
		onAbort(fn, controller);
		controller.abort("stop");

		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("stop");
	});

	it("does not call fn before the abort", () => {
		const controller = new AbortController();
		const fn = vi.fn();
		onAbort(fn, controller);

		expect(fn).not.toHaveBeenCalled();
	});

	it("calls fn at once if already aborted", () => {
		const controller = new AbortController();
		controller.abort("early");
		const fn = vi.fn();
		onAbort(fn, controller);

		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("early");
	});

	it("returns a callback that removes the subscription", () => {
		const controller = new AbortController();
		const fn = vi.fn();
		const off = onAbort(fn, controller);
		off();
		controller.abort();

		expect(fn).not.toHaveBeenCalled();
	});

	it("removes the listener from the signal on off", () => {
		const controller = new AbortController();
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		onAbort(() => {}, controller)();

		expect(remove).toHaveBeenCalledTimes(1);
	});

	it("off can be called twice, and after the abort", () => {
		const controller = new AbortController();
		const off = onAbort(() => {}, controller);
		controller.abort();

		expect(() => {
			off();
			off();
		}).not.toThrow();
	});

	it("the off of an already aborted signal is a no-op", () => {
		const controller = new AbortController();
		controller.abort();
		const off = onAbort(() => {}, controller);

		expect(() => off()).not.toThrow();
	});

	it("calls several subscribers in order", () => {
		const controller = new AbortController();
		const calls: string[] = [];
		onAbort(() => calls.push("first"), controller);
		onAbort(() => calls.push("second"), controller);
		controller.abort();

		expect(calls).toEqual(["first", "second"]);
	});

	it("accepts a task context", () => {
		const ctx = createHarness().ctx();
		const fn = vi.fn();
		onAbort(fn, ctx);
		ctx.abort("task gone");

		expect(fn).toHaveBeenCalledWith("task gone");
	});

	it("does not fire for a task that never aborts", () => {
		const ctx = createHarness().ctx();
		const fn = vi.fn();
		onAbort(fn, ctx);

		expect(fn).not.toHaveBeenCalled();
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
				cancellable<number>((resolve) => resolve(5), controller),
			).resolves.toBe(5);
		});

		it("resolves with a promise's value", async () => {
			const controller = new AbortController();

			await expect(
				cancellable<number>(
					(resolve) => resolve(Promise.resolve(7)),
					controller,
				),
			).resolves.toBe(7);
		});

		it("rejects with reject()", async () => {
			const controller = new AbortController();

			await expect(
				cancellable(
					(_resolve, reject) => reject(new Error("boom")),
					controller,
				),
			).rejects.toThrow("boom");
		});

		it("rejects when the executor throws", async () => {
			const controller = new AbortController();

			await expect(
				cancellable(() => {
					throw new Error("boom");
				}, controller),
			).rejects.toThrow("boom");
		});

		it("ignores later calls once settled", async () => {
			const controller = new AbortController();
			const promise = cancellable<number>((resolve, reject) => {
				resolve(1);
				resolve(2);
				reject(new Error("late"));
			}, controller);

			await expect(promise).resolves.toBe(1);
		});

		it("a throw after resolve does not override the result", async () => {
			const controller = new AbortController();
			const promise = cancellable<number>((resolve) => {
				resolve(1);
				throw new Error("late");
			}, controller);

			await expect(promise).resolves.toBe(1);
		});
	});

	describe("abort", () => {
		it("rejects with the abort reason", async () => {
			const controller = new AbortController();
			const promise = cancellable(() => {}, controller);
			const assertion = expect(promise).rejects.toBe("stop");
			controller.abort("stop");

			await assertion;
		});

		it("rejects with the default reason when aborted without one", async () => {
			const controller = new AbortController();
			const promise = cancellable(() => {}, controller);
			controller.abort();

			await expect(promise).rejects.toBe(controller.signal.reason);
		});

		it("does not run the executor if already aborted", async () => {
			const controller = new AbortController();
			controller.abort("early");
			const executor = vi.fn();

			await expect(cancellable(executor, controller)).rejects.toBe("early");
			expect(executor).not.toHaveBeenCalled();
		});

		it("runs the cleanups on abort, last registered first", async () => {
			const controller = new AbortController();
			const calls: string[] = [];
			const promise = cancellable((_resolve, _reject, onCancel) => {
				onCancel(() => calls.push("first"));
				onCancel(() => calls.push("second"));
			}, controller);
			const assertion = expect(promise).rejects.toBeDefined();
			controller.abort();
			await assertion;

			expect(calls).toEqual(["second", "first"]);
		});

		it("runs the cleanups before the rejection is observable", async () => {
			const controller = new AbortController();
			const calls: string[] = [];
			const promise = cancellable((_resolve, _reject, onCancel) => {
				onCancel(() => calls.push("cleanup"));
			}, controller).catch(() => calls.push("rejected"));
			controller.abort();
			await promise;

			expect(calls).toEqual(["cleanup", "rejected"]);
		});

		it("runs each cleanup once", async () => {
			const controller = new AbortController();
			const cleanup = vi.fn();
			const promise = cancellable((_resolve, _reject, onCancel) => {
				onCancel(cleanup);
			}, controller);
			const assertion = expect(promise).rejects.toBeDefined();
			controller.abort();
			await assertion;

			expect(cleanup).toHaveBeenCalledTimes(1);
		});

		it("runs a cleanup registered after the abort at once", async () => {
			const controller = new AbortController();
			let register: (cleanup: () => void) => void = () => {};
			const promise = cancellable((_resolve, _reject, onCancel) => {
				register = onCancel;
			}, controller);
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
			const promise = cancellable<number>((resolve) => {
				finish = resolve;
			}, controller);
			const assertion = expect(promise).rejects.toBe("stop");
			controller.abort("stop");
			finish(1);

			await assertion;
		});

		it("keeps running the other cleanups if one throws, and logs it", async () => {
			const error = vi.spyOn(console, "error").mockImplementation(() => {});
			const controller = new AbortController();
			const after = vi.fn();
			const promise = cancellable((_resolve, _reject, onCancel) => {
				onCancel(after);
				onCancel(() => {
					throw new Error("cleanup failed");
				});
			}, controller);
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
			const promise = cancellable<number>((resolve, _reject, onCancel) => {
				onCancel(cleanup);
				resolve(1);
			}, controller);
			await promise;
			controller.abort();

			expect(cleanup).not.toHaveBeenCalled();
			await expect(promise).resolves.toBe(1);
		});

		it("does not run the cleanups if it rejected first", async () => {
			const controller = new AbortController();
			const cleanup = vi.fn();
			const promise = cancellable((_resolve, reject, onCancel) => {
				onCancel(cleanup);
				reject(new Error("boom"));
			}, controller);
			await promise.catch(() => {});
			controller.abort();

			expect(cleanup).not.toHaveBeenCalled();
		});

		it("drops a cleanup registered after it settled", async () => {
			const controller = new AbortController();
			let register: (cleanup: () => void) => void = () => {};
			await cancellable<number>((resolve, _reject, onCancel) => {
				register = onCancel;
				resolve(1);
			}, controller);
			const cleanup = vi.fn();
			register(cleanup);
			controller.abort();

			expect(cleanup).not.toHaveBeenCalled();
		});

		it("removes the abort listener once it settled", async () => {
			const controller = new AbortController();
			const remove = vi.spyOn(controller.signal, "removeEventListener");
			await cancellable<number>((resolve) => resolve(1), controller);

			expect(remove).toHaveBeenCalledTimes(1);
		});

		it("removes the abort listener when the executor throws", async () => {
			const controller = new AbortController();
			const remove = vi.spyOn(controller.signal, "removeEventListener");
			await cancellable(() => {
				throw new Error("boom");
			}, controller).catch(() => {});

			expect(remove).toHaveBeenCalledTimes(1);
		});
	});

	describe("with timers and tasks", () => {
		it("a timer example: abort clears the timer", async () => {
			const controller = new AbortController();
			const promise = cancellable<void>((resolve, _reject, onCancel) => {
				const timer = setTimeout(resolve, 5000);
				onCancel(() => clearTimeout(timer));
			}, controller);
			const assertion = expect(promise).rejects.toBe("stop");
			expect(vi.getTimerCount()).toBe(1);
			controller.abort("stop");
			await assertion;

			expect(vi.getTimerCount()).toBe(0);
		});

		it("a timer example: finishing on its own leaves nothing behind", async () => {
			const controller = new AbortController();
			const promise = cancellable<void>((resolve, _reject, onCancel) => {
				const timer = setTimeout(resolve, 5000);
				onCancel(() => clearTimeout(timer));
			}, controller);
			await vi.advanceTimersByTimeAsync(5000);
			await promise;

			expect(vi.getTimerCount()).toBe(0);
		});

		it("works with a task context", async () => {
			const ctx = createHarness().ctx();
			const promise = cancellable<void>(() => {}, ctx);
			const assertion = expect(promise).rejects.toBe("gone");
			ctx.abort("gone");

			await assertion;
		});

		it("under latest, a superseded call clears its timer and drops the result", async () => {
			const h = createHarness();
			const fn = lat((n: number, ctx) =>
				cancellable<number>((resolve, _reject, onCancel) => {
					const timer = setTimeout(() => resolve(n), 1000);
					onCancel(() => clearTimeout(timer));
				}, ctx),
			);
			const first = fn(1, h.ctx());
			const second = fn(2, h.ctx());
			expect(vi.getTimerCount()).toBe(1);
			await vi.advanceTimersByTimeAsync(1000);

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe(2);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("under latest, the trace shows the superseded call as cancelled", async () => {
			const h = createHarness();
			const fn = lat((_: number, ctx) => cancellable<void>(() => {}, ctx));
			fn(1, h.ctx());
			fn(2, h.ctx());
			await Promise.resolve();

			expect(h.phases()).toEqual([
				"latest/start",
				"latest/cancel",
				"latest/start",
			]);
		});
	});
});
