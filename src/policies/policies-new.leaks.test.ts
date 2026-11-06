import { describe, expect, it } from "vitest";
import { type Context, createBus } from "../core/bus";
import type { EventMap } from "../core/types";
import { aliveCount, settleGarbage } from "../tests/test-helpers";
import { batch } from "./batch";
import { dedupe } from "./dedupe";
import { rateLimit } from "./rate-limit";

// A policy keeps state for each key while the key is busy. Once it is idle the state, and the payload
// that was the key, must be collectable. Real timers: the windows here are a few milliseconds.

type Item = { id: number };

const bus = createBus<EventMap>();
const newCtx = (): Context<EventMap> => {
	const got: Context<EventMap>[] = [];
	const off = bus.on("t", (_, ctx) => {
		got.push(ctx);
	});
	bus.emit("t", 0);
	off();
	const [ctx] = got;
	if (!ctx) {
		throw new Error("no context");
	}
	return ctx;
};

const wait = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

// makes an item and remembers a weak reference to it
const item = (refs: Array<WeakRef<object>>, id: number): Item => {
	const made = { id };
	refs.push(new WeakRef(made));
	return made;
};

describe("the newer policies do not keep what is idle", () => {
	it("sees an item that is still held, so the check is not empty", async () => {
		const refs: Array<WeakRef<object>> = [];
		const kept = item(refs, 1);
		await settleGarbage();

		expect(aliveCount(refs)).toBe(1);
		expect(kept.id).toBe(1);
	});

	it("dedupe: a key that is an object is collectable after its run settled", async () => {
		const refs: Array<WeakRef<object>> = [];
		const task = dedupe(async (value: Item) => value.id);
		const calls: Array<Promise<number | undefined>> = [];
		for (let index = 0; index < 100; index++) {
			calls.push(task(item(refs, index), newCtx()));
		}
		await Promise.all(calls);
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("dedupe: a key whose only call was aborted is collectable", async () => {
		const refs: Array<WeakRef<object>> = [];
		const task = dedupe((_value: Item) => new Promise<number>(() => {}));
		for (let index = 0; index < 100; index++) {
			const ctx = newCtx();
			task(item(refs, index), ctx);
			ctx.abort();
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("dedupe: a call that is aborted already leaves no key behind", async () => {
		const refs: Array<WeakRef<object>> = [];
		const task = dedupe(async (value: Item) => value.id);
		for (let index = 0; index < 100; index++) {
			const ctx = newCtx();
			ctx.abort();
			task(item(refs, index), ctx);
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("rateLimit: a key that is an object is collectable once its window is empty", async () => {
		const refs: Array<WeakRef<object>> = [];
		const task = rateLimit(1, 5, (value: Item) => value.id, {
			key: (value) => value,
		});
		const calls: Array<Promise<number | undefined>> = [];
		for (let index = 0; index < 100; index++) {
			calls.push(task(item(refs, index), newCtx()));
		}
		await Promise.all(calls);
		await wait(20);
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("rateLimit: waiting calls that were aborted are collectable at once", async () => {
		const refs: Array<WeakRef<object>> = [];
		const task = rateLimit(1, 10_000, (value: Item) => value.id);
		task(item([], 0), newCtx());
		const contexts: Context<EventMap>[] = [];
		for (let index = 1; index <= 100; index++) {
			const ctx = newCtx();
			contexts.push(ctx);
			task(item(refs, index), ctx);
		}
		for (const ctx of contexts) {
			ctx.abort();
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("batch: the payloads of a batch that was sent are collectable", async () => {
		const refs: Array<WeakRef<object>> = [];
		const task = batch(5, async (values: Item[]) => values.length);
		const calls: Array<Promise<number | undefined>> = [];
		for (let index = 0; index < 100; index++) {
			calls.push(task(item(refs, index), newCtx()));
		}
		await Promise.all(calls);
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("batch: a key that is an object is collectable after its batch settled", async () => {
		const refs: Array<WeakRef<object>> = [];
		const task = batch(5, async (values: Item[]) => values.length, {
			key: (value) => value,
		});
		const calls: Array<Promise<number | undefined>> = [];
		for (let index = 0; index < 100; index++) {
			calls.push(task(item(refs, index), newCtx()));
		}
		await Promise.all(calls);
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("batch: payloads of callers that aborted while collecting are collectable", async () => {
		const refs: Array<WeakRef<object>> = [];
		const task = batch(10_000, async (values: Item[]) => values.length);
		const contexts: Context<EventMap>[] = [];
		for (let index = 0; index < 100; index++) {
			const ctx = newCtx();
			contexts.push(ctx);
			task(item(refs, index), ctx);
		}
		for (const ctx of contexts) {
			ctx.abort();
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});
});
