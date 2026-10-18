import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createHarness,
	type Deferred,
	deferred,
	type TestEvents,
} from "../test-helpers";
import type { Task } from "../types";
import { debounce } from "./debounce";
import { byKey } from "./keyed";
import { latest } from "./latest";
import { leading } from "./leading";
import { queue } from "./queue";
import { throttle } from "./throttle";

type Payload = { id: string; n: number };

const id = (p: Payload) => p.id;
const pinned = <R>(fn: Task<Payload, TestEvents, R>) => fn;

describe("byKey", () => {
	it("makes one instance per key and reuses it", () => {
		const h = createHarness();
		const create = vi.fn(() => vi.fn());
		const task = byKey<string, TestEvents, void>((p) => p, create);
		task("a", h.ctx());
		task("a", h.ctx());
		task("b", h.ctx());

		expect(create).toHaveBeenCalledTimes(2);
	});

	it("gives each call to the right instance", () => {
		const h = createHarness();
		const made: Record<string, ReturnType<typeof vi.fn>> = {};
		const task = byKey<string, TestEvents, void>(
			(p) => p,
			() => {
				const fn = vi.fn();
				made[`${Object.keys(made).length}`] = fn;
				return fn;
			},
		);
		task("a", h.ctx());
		task("b", h.ctx());
		task("a", h.ctx());

		expect(made["0"]).toHaveBeenCalledTimes(2);
		expect(made["1"]).toHaveBeenCalledTimes(1);
	});

	it("forgets an instance when it reports idle, and makes a new one next time", () => {
		const h = createHarness();
		const idles: Array<() => void> = [];
		const create = vi.fn((onIdle: () => void) => {
			idles.push(onIdle);
			return vi.fn();
		});
		const task = byKey<string, TestEvents, void>((p) => p, create);
		task("a", h.ctx());
		idles[0]?.();
		task("a", h.ctx());

		expect(create).toHaveBeenCalledTimes(2);
	});

	it("keeps an instance that has not reported idle", () => {
		const h = createHarness();
		const create = vi.fn(() => vi.fn());
		const task = byKey<string, TestEvents, void>((p) => p, create);
		task("a", h.ctx());
		task("a", h.ctx());

		expect(create).toHaveBeenCalledTimes(1);
	});

	it("a late idle report of an old instance does not remove the new one", () => {
		const h = createHarness();
		const idles: Array<() => void> = [];
		const create = vi.fn((onIdle: () => void) => {
			idles.push(onIdle);
			return vi.fn();
		});
		const task = byKey<string, TestEvents, void>((p) => p, create);
		task("a", h.ctx());
		idles[0]?.();
		task("a", h.ctx());
		idles[0]?.();
		task("a", h.ctx());

		expect(create).toHaveBeenCalledTimes(2);
	});

	it("tells keys apart by value, and objects by identity", () => {
		const h = createHarness();
		const create = vi.fn(() => vi.fn());
		const shared = {};
		const task = byKey<unknown, TestEvents, void>((p) => p, create);
		task(1, h.ctx());
		task(1, h.ctx());
		task({}, h.ctx());
		task({}, h.ctx());
		task(shared, h.ctx());
		task(shared, h.ctx());

		expect(create).toHaveBeenCalledTimes(4);
	});

	it("returns what the instance returns", () => {
		const h = createHarness();
		const task = byKey<number, TestEvents, number>(
			(p) => p,
			() => (n) => n * 2,
		);

		expect(task(4, h.ctx())).toBe(8);
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
			const h = createHarness();
			const seen: Array<{ key: string; signal: AbortSignal }> = [];
			const keyed = latest(
				pinned((p, c) => {
					seen.push({ key: p.id, signal: c.signal });
					return new Promise(() => {});
				}),
				{ key: id },
			);
			keyed({ id: "a", n: 1 }, h.ctx());
			keyed({ id: "b", n: 1 }, h.ctx());
			keyed({ id: "a", n: 2 }, h.ctx());

			expect(seen.map((s) => s.signal.aborted)).toEqual([true, false, false]);
		});

		it("without a key one call aborts the other key's run", () => {
			const h = createHarness();
			const seen: AbortSignal[] = [];
			const plain = latest(
				pinned((_, c) => {
					seen.push(c.signal);
					return new Promise(() => {});
				}),
			);
			plain({ id: "a", n: 1 }, h.ctx());
			plain({ id: "b", n: 1 }, h.ctx());

			expect(seen[0]?.aborted).toBe(true);
		});

		it("results of different keys do not drop each other", async () => {
			const h = createHarness();
			const keyed = latest(
				pinned(async (p) => p.n),
				{ key: id },
			);
			const results = await Promise.all([
				keyed({ id: "a", n: 1 }, h.ctx()),
				keyed({ id: "b", n: 2 }, h.ctx()),
			]);

			expect(results).toEqual([1, 2]);
		});
	});

	describe("leading", () => {
		it("locks each key on its own", () => {
			const h = createHarness();
			const fn = vi.fn(() => new Promise(() => {}));
			const keyed = leading(pinned(fn), { key: id });
			keyed({ id: "a", n: 1 }, h.ctx());
			keyed({ id: "a", n: 2 }, h.ctx());
			keyed({ id: "b", n: 1 }, h.ctx());

			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("unlocks a key when its run is done", async () => {
			const h = createHarness();
			const d = deferred();
			const fn = vi.fn((p: Payload) => (p.n === 1 ? d.promise : p.n));
			const keyed = leading(pinned(fn), { key: id });
			const first = keyed({ id: "a", n: 1 }, h.ctx());
			d.resolve();
			await first;
			keyed({ id: "a", n: 2 }, h.ctx());

			expect(fn).toHaveBeenCalledTimes(2);
		});
	});

	describe("queue", () => {
		it("each key has its own line, so keys run in parallel", () => {
			const h = createHarness();
			const started: string[] = [];
			const keyed = queue(
				pinned((p) => {
					started.push(`${p.id}${p.n}`);
					return new Promise(() => {});
				}),
				{ key: id },
			);
			keyed({ id: "a", n: 1 }, h.ctx());
			keyed({ id: "a", n: 2 }, h.ctx());
			keyed({ id: "b", n: 1 }, h.ctx());

			expect(started).toEqual(["a1", "b1"]);
		});

		it("keeps the order within a key", async () => {
			const h = createHarness();
			const order: string[] = [];
			const keyed = queue(
				pinned(async (p) => {
					await new Promise((r) => setTimeout(r, 10 - p.n));
					order.push(`${p.id}${p.n}`);
				}),
				{ key: id },
			);
			const all = Promise.all([
				keyed({ id: "a", n: 1 }, h.ctx()),
				keyed({ id: "a", n: 2 }, h.ctx()),
				keyed({ id: "b", n: 1 }, h.ctx()),
				keyed({ id: "b", n: 2 }, h.ctx()),
			]);
			await vi.advanceTimersByTimeAsync(100);
			await all;

			expect(order.filter((o) => o.startsWith("a"))).toEqual(["a1", "a2"]);
			expect(order.filter((o) => o.startsWith("b"))).toEqual(["b1", "b2"]);
		});

		it("applies limit and overflow per key", async () => {
			const h = createHarness();
			const started: string[] = [];
			const gates: Record<string, Deferred<void>> = {};
			const keyed = queue(
				pinned((p) => {
					started.push(`${p.id}${p.n}`);
					const gate = deferred();
					gates[`${p.id}${p.n}`] = gate;
					return gate.promise;
				}),
				{ key: id, limit: 1, overflow: "drop-old" },
			);
			for (const n of [1, 2, 3]) {
				keyed({ id: "a", n }, h.ctx());
				keyed({ id: "b", n }, h.ctx());
			}
			gates.a1?.resolve(void 0);
			gates.b1?.resolve(void 0);
			await vi.advanceTimersByTimeAsync(0);

			expect(started).toEqual(["a1", "b1", "a3", "b3"]);
		});
	});

	describe("debounce", () => {
		it("each key waits on its own", async () => {
			const h = createHarness();
			const calls: string[] = [];
			const keyed = debounce(
				100,
				pinned((p) => calls.push(`${p.id}${p.n}`)),
				{ key: id },
			);
			keyed({ id: "a", n: 1 }, h.ctx());
			await vi.advanceTimersByTimeAsync(60);
			keyed({ id: "b", n: 1 }, h.ctx());
			await vi.advanceTimersByTimeAsync(30);
			keyed({ id: "a", n: 2 }, h.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(calls).toEqual(["b1", "a2"]);
		});

		it("works with leading per key", () => {
			const h = createHarness();
			const calls: string[] = [];
			const keyed = debounce(
				100,
				pinned((p) => calls.push(`${p.id}${p.n}`)),
				{ key: id, leading: true },
			);
			keyed({ id: "a", n: 1 }, h.ctx());
			keyed({ id: "a", n: 2 }, h.ctx());
			keyed({ id: "b", n: 1 }, h.ctx());

			expect(calls).toEqual(["a1", "b1"]);
		});
	});

	describe("throttle", () => {
		it("each key has its own window", async () => {
			const h = createHarness();
			const calls: string[] = [];
			const keyed = throttle(
				100,
				pinned((p) => calls.push(`${p.id}${p.n}`)),
				{ key: id },
			);
			keyed({ id: "a", n: 1 }, h.ctx());
			keyed({ id: "b", n: 1 }, h.ctx());
			keyed({ id: "a", n: 2 }, h.ctx());
			keyed({ id: "b", n: 2 }, h.ctx());
			expect(calls).toEqual(["a1", "b1"]);
			await vi.advanceTimersByTimeAsync(100);

			expect(calls).toEqual(["a1", "b1", "a2", "b2"]);
		});

		it("works with trailing: false per key", async () => {
			const h = createHarness();
			const calls: string[] = [];
			const keyed = throttle(
				100,
				pinned((p) => calls.push(`${p.id}${p.n}`)),
				{ key: id, trailing: false },
			);
			keyed({ id: "a", n: 1 }, h.ctx());
			keyed({ id: "a", n: 2 }, h.ctx());
			keyed({ id: "b", n: 1 }, h.ctx());
			await vi.advanceTimersByTimeAsync(1000);

			expect(calls).toEqual(["a1", "b1"]);
		});
	});

	describe("idle keys are forgotten", () => {
		// the state of a key lives in a Map; it must be deleted once the key is idle
		const forgotten = (spy: { mock: { calls: unknown[][] } }, key: string) =>
			spy.mock.calls.some((c) => c[0] === key);

		it("latest", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const h = createHarness();
			const keyed = latest(
				pinned(async (p) => p.n),
				{ key: id },
			);
			const run = keyed({ id: "k-latest", n: 1 }, h.ctx());
			await run;

			expect(forgotten(spy, "k-latest")).toBe(true);
		});

		it("latest keeps a key while its run is going", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const h = createHarness();
			const d = deferred();
			const keyed = latest(
				pinned(() => d.promise),
				{ key: id },
			);
			keyed({ id: "k-busy", n: 1 }, h.ctx());

			expect(forgotten(spy, "k-busy")).toBe(false);
			d.resolve();
		});

		it("leading", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const h = createHarness();
			const keyed = leading(
				pinned(async (p) => p.n),
				{ key: id },
			);
			await keyed({ id: "k-leading", n: 1 }, h.ctx());

			expect(forgotten(spy, "k-leading")).toBe(true);
		});

		it("queue", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const h = createHarness();
			const keyed = queue(
				pinned(async (p) => p.n),
				{ key: id },
			);
			await Promise.all([
				keyed({ id: "k-queue", n: 1 }, h.ctx()),
				keyed({ id: "k-queue", n: 2 }, h.ctx()),
			]);

			expect(forgotten(spy, "k-queue")).toBe(true);
		});

		it("queue keeps a key while calls wait", () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const h = createHarness();
			const keyed = queue(
				pinned(() => new Promise(() => {})),
				{ key: id },
			);
			keyed({ id: "k-wait", n: 1 }, h.ctx());
			keyed({ id: "k-wait", n: 2 }, h.ctx());

			expect(forgotten(spy, "k-wait")).toBe(false);
		});

		it("debounce", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const h = createHarness();
			const keyed = debounce(
				10,
				pinned((p) => p.n),
				{ key: id },
			);
			keyed({ id: "k-debounce", n: 1 }, h.ctx());
			await vi.advanceTimersByTimeAsync(10);

			expect(forgotten(spy, "k-debounce")).toBe(true);
		});

		it("throttle", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const h = createHarness();
			const keyed = throttle(
				10,
				pinned((p) => p.n),
				{ key: id },
			);
			keyed({ id: "k-throttle", n: 1 }, h.ctx());
			expect(forgotten(spy, "k-throttle")).toBe(false);
			await vi.advanceTimersByTimeAsync(10);

			expect(forgotten(spy, "k-throttle")).toBe(true);
		});

		it("throttle waits a full window after a trailing run before forgetting the key", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const h = createHarness();
			const keyed = throttle(
				100,
				pinned((p) => p.n),
				{ key: id },
			);
			keyed({ id: "k-cool", n: 1 }, h.ctx());
			keyed({ id: "k-cool", n: 2 }, h.ctx());
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
			const h = createHarness();
			const calls: number[] = [];
			const keyed = throttle(
				100,
				pinned((p) => calls.push(p.n)),
				{ key: id },
			);
			keyed({ id: "k-warm", n: 1 }, h.ctx()); // t=0
			await vi.advanceTimersByTimeAsync(50);
			keyed({ id: "k-warm", n: 2 }, h.ctx()); // t=50
			await vi.advanceTimersByTimeAsync(50); // trailing run of 2 at t=100
			expect(calls).toEqual([1, 2]);
			await vi.advanceTimersByTimeAsync(20);
			keyed({ id: "k-warm", n: 3 }, h.ctx()); // t=120: recent call and run
			expect(calls).toEqual([1, 2]);
			await vi.advanceTimersByTimeAsync(99);
			expect(calls).toEqual([1, 2]);
			await vi.advanceTimersByTimeAsync(1); // t=220

			expect(calls).toEqual([1, 2, 3]);
			expect(forgotten(spy, "k-warm")).toBe(false);
		});

		it("a forgotten key starts fresh", async () => {
			const h = createHarness();
			const fn = vi.fn((p: Payload) => p.n);
			const keyed = leading(pinned(fn), { key: id });
			await keyed({ id: "a", n: 1 }, h.ctx());
			await keyed({ id: "a", n: 2 }, h.ctx());

			expect(fn).toHaveBeenCalledTimes(2);
		});

		it("many keys do not accumulate", async () => {
			const spy = vi.spyOn(Map.prototype, "delete");
			const h = createHarness();
			const keyed = latest(
				pinned(async (p) => p.n),
				{ key: id },
			);
			for (let n = 0; n < 50; n++) {
				await keyed({ id: `many-${n}`, n }, h.ctx());
			}
			const deleted = spy.mock.calls.filter(
				(c) => typeof c[0] === "string" && c[0].startsWith("many-"),
			);

			expect(deleted).toHaveLength(50);
		});
	});
});
