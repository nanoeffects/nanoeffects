import { describe, expect, it } from "vitest";
import { type Context, createBus } from "../core/bus";
import type { EventMap } from "../core/types";
import { aliveCount, settleGarbage } from "../tests/test-helpers";
import { debounce } from "./debounce";
import { latest } from "./latest";
import { leading } from "./leading";
import { queue } from "./queue";
import { throttle } from "./throttle";

// A call whose task is aborted already starts nothing, so a key that was made only for it must not stay behind.

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

type Item = { id: number };

// made in a function of its own, so that no variable of the test keeps the last one alive
const callWithNewItem = (
	task: (item: Item, ctx: Context<EventMap>) => unknown,
	refs: Array<WeakRef<object>>,
	id: number,
) => {
	const item = { id };
	refs.push(new WeakRef(item));
	const ctx = newCtx();
	ctx.abort();
	task(item, ctx);
};

const policies: Array<[string, (key: (item: Item) => unknown) => unknown]> = [
	["latest", (key) => latest((_item: Item) => {}, { key })],
	["leading", (key) => leading((_item: Item) => {}, { key })],
	["debounce", (key) => debounce(5, (_item: Item) => {}, { key })],
	["throttle", (key) => throttle(5, (_item: Item) => {}, { key })],
	["queue", (key) => queue((_item: Item) => {}, { key })],
];

describe("a key made for a call that was aborted already is forgotten", () => {
	it.each(policies)("%s", async (_name, make) => {
		const task = make((item) => item) as (
			item: Item,
			ctx: Context<EventMap>,
		) => unknown;
		const refs: Array<WeakRef<object>> = [];
		for (let index = 0; index < 100; index++) {
			callWithNewItem(task, refs, index);
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});
});
