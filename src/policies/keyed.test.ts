import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../core/types";
import {
	createHarness,
	type Deferred,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { debounce } from "./debounce";
import { byKey } from "./keyed";
import { latest } from "./latest";
import { leading } from "./leading";
import { queue } from "./queue";
import { throttle } from "./throttle";

type Payload = { id: string; n: number };

const id = (payload: Payload) => payload.id;
const pinned = <R>(handler: Task<Payload, TestEvents, R>) => handler;

describe("byKey", () => {
	it("makes one instance per key and reuses it", () => {
		const harness = createHarness();
		const create = vi.fn(() => vi.fn());
		const task = byKey<string, TestEvents, void>((payload) => payload, create);
		task("a", harness.ctx());
		task("a", harness.ctx());
		task("b", harness.ctx());

		expect(create).toHaveBeenCalledTimes(2);
	});

	it("gives each call to the right instance", () => {
		const harness = createHarness();
		const made: Record<string, ReturnType<typeof vi.fn>> = {};
		const task = byKey<string, TestEvents, void>(
			(payload) => payload,
			() => {
				const handler = vi.fn();
				made[`${Object.keys(made).length}`] = handler;
				return handler;
			},
		);
		task("a", harness.ctx());
		task("b", harness.ctx());
		task("a", harness.ctx());

		expect(made["0"]).toHaveBeenCalledTimes(2);
		expect(made["1"]).toHaveBeenCalledTimes(1);
	});

	it("forgets an instance when it reports idle, and makes a new one next time", () => {
		const harness = createHarness();
		const idles: Array<() => void> = [];
		const create = vi.fn((onIdle: () => void) => {
			idles.push(onIdle);
			return vi.fn();
		});
		const task = byKey<string, TestEvents, void>((payload) => payload, create);
		task("a", harness.ctx());
		idles[0]?.();
		task("a", harness.ctx());

		expect(create).toHaveBeenCalledTimes(2);
	});

	it("keeps an instance that has not reported idle", () => {
		const harness = createHarness();
		const create = vi.fn(() => vi.fn());
		const task = byKey<string, TestEvents, void>((payload) => payload, create);
		task("a", harness.ctx());
		task("a", harness.ctx());

		expect(create).toHaveBeenCalledTimes(1);
	});

	it("a late idle report of an old instance does not remove the new one", () => {
		const harness = createHarness();
		const idles: Array<() => void> = [];
		const create = vi.fn((onIdle: () => void) => {
			idles.push(onIdle);
			return vi.fn();
		});
		const task = byKey<string, TestEvents, void>((payload) => payload, create);
		task("a", harness.ctx());
		idles[0]?.();
		task("a", harness.ctx());
		idles[0]?.();
		task("a", harness.ctx());

		expect(create).toHaveBeenCalledTimes(2);
	});

	it("tells keys apart by value, and objects by identity", () => {
		const harness = createHarness();
		const create = vi.fn(() => vi.fn());
		const shared = {};
		const task = byKey<unknown, TestEvents, void>((payload) => payload, create);
		task(1, harness.ctx());
		task(1, harness.ctx());
		task({}, harness.ctx());
		task({}, harness.ctx());
		task(shared, harness.ctx());
		task(shared, harness.ctx());

		expect(create).toHaveBeenCalledTimes(4);
	});

	it("returns what the instance returns", () => {
		const harness = createHarness();
		const task = byKey<number, TestEvents, number>(
			(payload) => payload,
			() => (value) => value * 2,
		);

		expect(task(4, harness.ctx())).toBe(8);
	});
});

describe("keyed policies", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("latest", () => {
		it("a call aborts the previous run of its own key only", () => {
			const harness = createHarness();
			const seen: Array<{ key: string; signal: AbortSignal }> = [];
			const keyed = latest(
				pinned((payload, ctx) => {
					seen.push({ key: payload.id, signal: ctx.signal });
					return new Promise(() => {});
				}),
				{ key: id },
			);
			keyed({ id: "a", n: 1 }, harness.ctx());
			keyed({ id: "b", n: 1 }, harness.ctx());
			keyed({ id: "a", n: 2 }, harness.ctx());

			expect(seen.map((ctx) => ctx.signal.aborted)).toEqual([
				true,
				false,
				false,
			]);
		});

		it("without a key one call aborts the other key's run", () => {
			const harness = createHarness();
			const seen: AbortSignal[] = [];
			const plain = latest(
				pinned((_, ctx) => {
					seen.push(ctx.signal);
					return new Promise(() => {});
				}),
			);
			plain({ id: "a", n: 1 }, harness.ctx());
			plain({ id: "b", n: 1 }, harness.ctx());

			expect(seen[0]?.aborted).toBe(true);
		});

		it("results of different keys do not drop each other", async () => {
			const harness = createHarness();
			const keyed = latest(
				pinned(async (payload) => payload.n),
				{ key: id },
			);
			const results = await Promise.all([
				keyed({ id: "a", n: 1 }, harness.ctx()),
				keyed({ id: "b", n: 2 }, harness.ctx()),
			]);

			expect(results).toEqual([1, 2]);
		});
	});

	describe("leading", () => {
		it("locks each key on its own", () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise(() => {}));
			const keyed = leading(pinned(handler), { key: id });
			keyed({ id: "a", n: 1 }, harness.ctx());
			keyed({ id: "a", n: 2 }, harness.ctx());
			keyed({ id: "b", n: 1 }, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("unlocks a key when its run is done", async () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn((payload: Payload) =>
				payload.n === 1 ? gate.promise : payload.n,
			);
			const keyed = leading(pinned(handler), { key: id });
			const first = keyed({ id: "a", n: 1 }, harness.ctx());
			gate.resolve();
			await first;
			keyed({ id: "a", n: 2 }, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("queue", () => {
		it("each key has its own line, so keys run in parallel", () => {
			const harness = createHarness();
			const started: string[] = [];
			const keyed = queue(
				pinned((payload) => {
					started.push(`${payload.id}${payload.n}`);
					return new Promise(() => {});
				}),
				{ key: id },
			);
			keyed({ id: "a", n: 1 }, harness.ctx());
			keyed({ id: "a", n: 2 }, harness.ctx());
			keyed({ id: "b", n: 1 }, harness.ctx());

			expect(started).toEqual(["a1", "b1"]);
		});

		it("keeps the order within a key", async () => {
			const harness = createHarness();
			const order: string[] = [];
			const keyed = queue(
				pinned(async (payload) => {
					await new Promise((result) => setTimeout(result, 10 - payload.n));
					order.push(`${payload.id}${payload.n}`);
				}),
				{ key: id },
			);
			const all = Promise.all([
				keyed({ id: "a", n: 1 }, harness.ctx()),
				keyed({ id: "a", n: 2 }, harness.ctx()),
				keyed({ id: "b", n: 1 }, harness.ctx()),
				keyed({ id: "b", n: 2 }, harness.ctx()),
			]);
			await vi.advanceTimersByTimeAsync(100);
			await all;

			expect(order.filter((entry) => entry.startsWith("a"))).toEqual([
				"a1",
				"a2",
			]);
			expect(order.filter((entry) => entry.startsWith("b"))).toEqual([
				"b1",
				"b2",
			]);
		});

		it("applies limit and overflow per key", async () => {
			const harness = createHarness();
			const started: string[] = [];
			const gates: Record<string, Deferred<void>> = {};
			const keyed = queue(
				pinned((payload) => {
					started.push(`${payload.id}${payload.n}`);
					const gate = deferred();
					gates[`${payload.id}${payload.n}`] = gate;
					return gate.promise;
				}),
				{ key: id, limit: 1, overflow: "drop-old" },
			);
			for (const value of [1, 2, 3]) {
				keyed({ id: "a", n: value }, harness.ctx());
				keyed({ id: "b", n: value }, harness.ctx());
			}
			gates.a1?.resolve(void 0);
			gates.b1?.resolve(void 0);
			await vi.advanceTimersByTimeAsync(0);

			expect(started).toEqual(["a1", "b1", "a3", "b3"]);
		});
	});

	describe("debounce", () => {
		it("each key waits on its own", async () => {
			const harness = createHarness();
			const calls: string[] = [];
			const keyed = debounce(
				100,
				pinned((payload) => calls.push(`${payload.id}${payload.n}`)),
				{ key: id },
			);
			keyed({ id: "a", n: 1 }, harness.ctx());
			await vi.advanceTimersByTimeAsync(60);
			keyed({ id: "b", n: 1 }, harness.ctx());
			await vi.advanceTimersByTimeAsync(30);
			keyed({ id: "a", n: 2 }, harness.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(calls).toEqual(["b1", "a2"]);
		});

		it("works with leading per key", () => {
			const harness = createHarness();
			const calls: string[] = [];
			const keyed = debounce(
				100,
				pinned((payload) => calls.push(`${payload.id}${payload.n}`)),
				{ key: id, leading: true },
			);
			keyed({ id: "a", n: 1 }, harness.ctx());
			keyed({ id: "a", n: 2 }, harness.ctx());
			keyed({ id: "b", n: 1 }, harness.ctx());

			expect(calls).toEqual(["a1", "b1"]);
		});
	});

	describe("throttle", () => {
		it("each key has its own window", async () => {
			const harness = createHarness();
			const calls: string[] = [];
			const keyed = throttle(
				100,
				pinned((payload) => calls.push(`${payload.id}${payload.n}`)),
				{ key: id },
			);
			keyed({ id: "a", n: 1 }, harness.ctx());
			keyed({ id: "b", n: 1 }, harness.ctx());
			keyed({ id: "a", n: 2 }, harness.ctx());
			keyed({ id: "b", n: 2 }, harness.ctx());
			expect(calls).toEqual(["a1", "b1"]);
			await vi.advanceTimersByTimeAsync(100);

			expect(calls).toEqual(["a1", "b1", "a2", "b2"]);
		});

		it("works with trailing: false per key", async () => {
			const harness = createHarness();
			const calls: string[] = [];
			const keyed = throttle(
				100,
				pinned((payload) => calls.push(`${payload.id}${payload.n}`)),
				{ key: id, trailing: false },
			);
			keyed({ id: "a", n: 1 }, harness.ctx());
			keyed({ id: "a", n: 2 }, harness.ctx());
			keyed({ id: "b", n: 1 }, harness.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(calls).toEqual(["a1", "b1"]);
		});
	});

	describe("idle keys are forgotten", () => {
		// the state of a key lives in a Map; it must be deleted once the key is idle
		const forgotten = (spy: { mock: { calls: unknown[][] } }, key: string) =>
			spy.mock.calls.some((call) => call[0] === key);

		it("latest", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const keyed = latest(
				pinned(async (payload) => payload.n),
				{ key: id },
			);
			const run = keyed({ id: "k-latest", n: 1 }, harness.ctx());
			await run;

			expect(forgotten(spy, "k-latest")).toBe(true);
		});

		it("latest keeps a key while its run is going", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const gate = deferred();
			const keyed = latest(
				pinned(() => gate.promise),
				{ key: id },
			);
			keyed({ id: "k-busy", n: 1 }, harness.ctx());

			expect(forgotten(spy, "k-busy")).toBe(false);
			gate.resolve();
		});

		it("leading", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const keyed = leading(
				pinned(async (payload) => payload.n),
				{ key: id },
			);
			await keyed({ id: "k-leading", n: 1 }, harness.ctx());

			expect(forgotten(spy, "k-leading")).toBe(true);
		});

		it("queue", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const keyed = queue(
				pinned(async (payload) => payload.n),
				{ key: id },
			);
			await Promise.all([
				keyed({ id: "k-queue", n: 1 }, harness.ctx()),
				keyed({ id: "k-queue", n: 2 }, harness.ctx()),
			]);

			expect(forgotten(spy, "k-queue")).toBe(true);
		});

		it("queue keeps a key while calls wait", () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const keyed = queue(
				pinned(() => new Promise(() => {})),
				{ key: id },
			);
			keyed({ id: "k-wait", n: 1 }, harness.ctx());
			keyed({ id: "k-wait", n: 2 }, harness.ctx());

			expect(forgotten(spy, "k-wait")).toBe(false);
		});

		it("debounce", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const keyed = debounce(
				10,
				pinned((payload) => payload.n),
				{ key: id },
			);
			keyed({ id: "k-debounce", n: 1 }, harness.ctx());
			await vi.advanceTimersByTimeAsync(10);

			expect(forgotten(spy, "k-debounce")).toBe(true);
		});

		it("throttle", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const keyed = throttle(
				10,
				pinned((payload) => payload.n),
				{ key: id },
			);
			keyed({ id: "k-throttle", n: 1 }, harness.ctx());
			expect(forgotten(spy, "k-throttle")).toBe(false);
			await vi.advanceTimersByTimeAsync(10);

			expect(forgotten(spy, "k-throttle")).toBe(true);
		});

		it("throttle waits a full window after a trailing run before forgetting the key", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const keyed = throttle(
				100,
				pinned((payload) => payload.n),
				{ key: id },
			);
			keyed({ id: "k-cool", n: 1 }, harness.ctx());
			keyed({ id: "k-cool", n: 2 }, harness.ctx());
			await vi.advanceTimersByTimeAsync(100); // trailing run at t=100
			expect(forgotten(spy, "k-cool")).toBe(false);
			await vi.advanceTimersByTimeAsync(99);
			expect(forgotten(spy, "k-cool")).toBe(false);
			await vi.advanceTimersByTimeAsync(1);

			expect(forgotten(spy, "k-cool")).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("a call during the cool-down keeps the key and its timing", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const calls: number[] = [];
			const keyed = throttle(
				100,
				pinned((payload) => calls.push(payload.n)),
				{ key: id },
			);
			keyed({ id: "k-warm", n: 1 }, harness.ctx()); // t=0
			await vi.advanceTimersByTimeAsync(50);
			keyed({ id: "k-warm", n: 2 }, harness.ctx()); // t=50
			await vi.advanceTimersByTimeAsync(50); // trailing run of 2 at t=100
			expect(calls).toEqual([1, 2]);
			await vi.advanceTimersByTimeAsync(20);
			keyed({ id: "k-warm", n: 3 }, harness.ctx()); // t=120: recent call and run
			expect(calls).toEqual([1, 2]);
			await vi.advanceTimersByTimeAsync(99);
			expect(calls).toEqual([1, 2]);
			await vi.advanceTimersByTimeAsync(1); // t=220

			expect(calls).toEqual([1, 2, 3]);
			expect(forgotten(spy, "k-warm")).toBe(false);
		});

		it("a forgotten key starts fresh", async () => {
			const harness = createHarness();
			const handler = vi.fn((payload: Payload) => payload.n);
			const keyed = leading(pinned(handler), { key: id });
			await keyed({ id: "a", n: 1 }, harness.ctx());
			await keyed({ id: "a", n: 2 }, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("many keys do not accumulate", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const harness = createHarness();
			const keyed = latest(
				pinned(async (payload) => payload.n),
				{ key: id },
			);
			for (let index = 0; index < 50; index++) {
				await keyed({ id: `many-${index}`, n: index }, harness.ctx());
			}
			const deleted = spy.mock.calls.filter(
				(call) => typeof call[0] === "string" && call[0].startsWith("many-"),
			);

			expect(deleted).toHaveLength(50);
		});
	});
});
