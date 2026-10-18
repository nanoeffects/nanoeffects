import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { delay, isPromise, linkedController, after as runAfter } from ".";

describe("linkedController", () => {
	it("works without a parent", () => {
		const { controller, unlink } = linkedController();

		expect(controller.signal.aborted).toBe(false);
		expect(() => unlink()).not.toThrow();
	});

	it("aborts with the parent and keeps its reason", () => {
		const parent = new AbortController();
		const { controller } = linkedController(parent.signal);
		parent.abort("stop");

		expect(controller.signal.aborted).toBe(true);
		expect(controller.signal.reason).toBe("stop");
	});

	it("does not abort the parent when it is aborted itself", () => {
		const parent = new AbortController();
		const { controller } = linkedController(parent.signal);
		controller.abort();

		expect(parent.signal.aborted).toBe(false);
	});

	it("starts aborted if the parent is already aborted", () => {
		const parent = new AbortController();
		parent.abort("early");
		const { controller } = linkedController(parent.signal);

		expect(controller.signal.aborted).toBe(true);
		expect(controller.signal.reason).toBe("early");
	});

	it("stops following the parent after unlink", () => {
		const parent = new AbortController();
		const { controller, unlink } = linkedController(parent.signal);
		unlink();
		parent.abort();

		expect(controller.signal.aborted).toBe(false);
	});

	it("unlink on an already aborted parent is harmless", () => {
		const parent = new AbortController();
		parent.abort();
		const { unlink } = linkedController(parent.signal);

		expect(() => unlink()).not.toThrow();
	});

	it("links a chain of controllers", () => {
		const root = new AbortController();
		const a = linkedController(root.signal);
		const b = linkedController(a.controller.signal);
		root.abort("root");

		expect(b.controller.signal.aborted).toBe(true);
		expect(b.controller.signal.reason).toBe("root");
	});

	it("aborting a middle controller does not reach the root or siblings", () => {
		const root = new AbortController();
		const a = linkedController(root.signal);
		const b = linkedController(root.signal);
		a.controller.abort();

		expect(root.signal.aborted).toBe(false);
		expect(b.controller.signal.aborted).toBe(false);
	});
});

describe("delay", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("resolves after the given time", async () => {
		const done = vi.fn();
		delay({}, 100).then(done);
		await vi.advanceTimersByTimeAsync(99);
		expect(done).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);

		expect(done).toHaveBeenCalledTimes(1);
	});

	it("resolves with nothing", async () => {
		const promise = delay({}, 10);
		await vi.advanceTimersByTimeAsync(10);

		await expect(promise).resolves.toBeUndefined();
	});

	it("works without a context", async () => {
		const promise = delay({}, 10);
		await vi.advanceTimersByTimeAsync(10);

		await expect(promise).resolves.toBeUndefined();
	});

	it("rejects with the abort reason and clears the timer", async () => {
		const controller = new AbortController();
		const promise = delay(controller, 100);
		const assertion = expect(promise).rejects.toBe("stop");
		controller.abort("stop");
		await assertion;

		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects at once if already aborted, without a timer", async () => {
		const controller = new AbortController();
		controller.abort("early");
		const promise = delay(controller, 100);

		await expect(promise).rejects.toBe("early");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("ignores an abort after it resolved", async () => {
		const controller = new AbortController();
		const promise = delay(controller, 10);
		await vi.advanceTimersByTimeAsync(10);
		controller.abort();

		await expect(promise).resolves.toBeUndefined();
	});
});

describe("delay with a function", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("waits for the number of ms the function returns", async () => {
		const done = vi.fn();
		delay({}, () => 100).then(done);
		await vi.advanceTimersByTimeAsync(99);
		expect(done).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);

		expect(done).toHaveBeenCalledTimes(1);
	});

	it("calls the function once, when the delay starts", async () => {
		const ms = vi.fn(() => 50);
		expect(ms).not.toHaveBeenCalled();
		const promise = delay({}, ms);
		expect(ms).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(50);
		await promise;

		expect(ms).toHaveBeenCalledTimes(1);
	});

	it("supports a random pause", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const done = vi.fn();
		delay({}, () => 200 + Math.random() * 200).then(done);
		await vi.advanceTimersByTimeAsync(299);
		expect(done).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);

		expect(done).toHaveBeenCalledTimes(1);
	});

	it("supports a growing pause with a counter in a closure", async () => {
		let attempt = 0;
		const start = Date.now();
		const times: number[] = [];
		const wait = () => delay({}, () => 100 * 2 ** attempt++);
		for (let i = 0; i < 3; i++) {
			const pending = wait();
			await vi.advanceTimersByTimeAsync(1000);
			await pending;
			times.push(attempt);
		}

		expect(times).toEqual([1, 2, 3]);
		expect(Date.now() - start).toBe(3000);
	});

	it("rejects with the abort reason and clears the timer", async () => {
		const controller = new AbortController();
		const promise = delay(controller, () => 1000);
		const assertion = expect(promise).rejects.toBe("stop");
		controller.abort("stop");
		await assertion;

		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects if the function throws, leaving no timer", async () => {
		await expect(
			delay({}, () => {
				throw new Error("bad pause");
			}),
		).rejects.toThrow("bad pause");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("accepts 0", async () => {
		const promise = delay({}, () => 0);
		await vi.advanceTimersByTimeAsync(0);

		await expect(promise).resolves.toBeUndefined();
	});
});

describe("isPromise", () => {
	it("accepts promises and thenables", () => {
		expect(isPromise(Promise.resolve())).toBe(true);
		// biome-ignore lint/suspicious/noThenProperty: a thenable is the point of this test
		expect(isPromise({ then: () => {} })).toBe(true);
	});

	it("rejects everything else", () => {
		expect(isPromise(null)).toBe(false);
		expect(isPromise(1)).toBe(false);
		expect(isPromise("then")).toBe(false);
		expect(isPromise({})).toBe(false);
		// biome-ignore lint/suspicious/noThenProperty: a thenable is the point of this test
		expect(isPromise({ then: 1 })).toBe(false);
		expect(isPromise(() => {})).toBe(false);
	});
});

describe("runAfter", () => {
	it("runs done at once for a sync value and returns it", () => {
		const done = vi.fn();

		expect(runAfter(5, done)).toBe(5);
		expect(done).toHaveBeenCalledTimes(1);
	});

	it("runs done after a promise resolved", async () => {
		const done = vi.fn();
		const promise = runAfter(Promise.resolve(5), done);
		expect(done).not.toHaveBeenCalled();

		await expect(promise).resolves.toBe(5);
		expect(done).toHaveBeenCalledTimes(1);
	});

	it("runs done after a promise rejected and keeps the rejection", async () => {
		const done = vi.fn();

		await expect(
			runAfter(Promise.reject(new Error("boom")), done),
		).rejects.toThrow("boom");
		expect(done).toHaveBeenCalledTimes(1);
	});
});
