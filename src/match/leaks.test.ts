import { describe, expect, it } from "vitest";
import { createBus } from "../core/bus";
import { aliveCount, settleGarbage } from "../tests/test-helpers";
import { type MatchApi, matchPlugin } from ".";

type Events = { ping: number };

// makes a predicate and a handler, remembers weak references to them, and hands them to `use`
const subscribed = (
	refs: Array<WeakRef<object>>,
	use: (predicate: () => boolean, handler: () => void) => void,
) => {
	const predicate = () => true;
	const handler = () => {};
	refs.push(new WeakRef(predicate), new WeakRef(handler));
	use(predicate, handler);
};

describe("matchPlugin: subscriptions do not leak", () => {
	it("the check sees a predicate that is still subscribed", async () => {
		const bus = createBus<Events>().use(matchPlugin());
		const refs: Array<WeakRef<object>> = [];
		subscribed(refs, (predicate, handler) => {
			bus.on(predicate, handler);
		});
		await settleGarbage();

		expect(aliveCount(refs)).toBe(2);
	});

	it("are collectable after the function that on returned is called", async () => {
		const bus = createBus<Events>().use(matchPlugin());
		const refs: Array<WeakRef<object>> = [];
		for (let round = 0; round < 50; round++) {
			subscribed(refs, (predicate, handler) => {
				bus.on(predicate, handler)();
			});
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("are collectable after off by predicate and by handler", async () => {
		const bus = createBus<Events>().use(matchPlugin());
		const refs: Array<WeakRef<object>> = [];
		subscribed(refs, (predicate, handler) => {
			bus.on(predicate, handler);
			bus.off(predicate);
		});
		subscribed(refs, (predicate, handler) => {
			bus.on(predicate, handler);
			bus.off(predicate, handler);
		});
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("are collectable after a once has matched", async () => {
		const bus = createBus<Events>().use(matchPlugin());
		const refs: Array<WeakRef<object>> = [];
		subscribed(refs, (predicate, handler) => {
			bus.once(predicate, handler);
		});
		bus.emit("ping", 1);
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("are collectable after off() and after the task of ctx.on aborts", async () => {
		const bus = createBus<Events>().use(matchPlugin());
		const refs: Array<WeakRef<object>> = [];
		subscribed(refs, (predicate, handler) => {
			bus.on(predicate, handler);
		});
		bus.off();

		let abort = () => {};
		bus.on("ping", (_value, ctx) => {
			abort = () => ctx.abort();
			const on = ctx.on as MatchApi<Events>["on"];
			subscribed(refs, (predicate, handler) => {
				on(predicate, handler);
			});
		});
		bus.emit("ping", 1);
		abort();
		bus.off();
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});
});
