import { describe, expect, it, vi } from "vitest";
import type { Call } from "../core/action-creator";
import { createBus } from "../core/bus";
import { latest } from "../policies";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { createAction } from "./action";
import { actionsPlugin, setHandler } from "./handled";
import { createJob } from "./job";

type Events = TestEvents & { "user/get": string };

const setup = () => {
	const recorder = createTraceRecorder<Events>();
	const bus = createBus<Events>({ trace: createTracer(recorder) });
	const actions = bus.use(actionsPlugin());
	const phases = () =>
		recorder.events.map((event) => `${event.effect}/${event.phase}`);
	return { bus, actions, recorder, phases };
};

describe("createAction", () => {
	describe("an action with a handler", () => {
		it("calling the action builds an action and does not run the handler", () => {
			const handler = vi.fn((value: number) => value * 2);
			const double = createAction("math/double", handler);

			expect(double(21)).toEqual({ type: "math/double", payload: 21 });
			expect(handler).not.toHaveBeenCalled();
		});

		it("emit of a call of an action with a handler runs the handler and returns its result", () => {
			const { bus } = setup();
			const double = createAction("math/double", (value: number) => value * 2);
			const seen: number[] = [];
			bus.on(double, (value) => seen.push(value));

			expect(bus.emit(double(21))).toBe(42);
			expect(seen).toEqual([21]);
		});

		it("a plain action of the same type does not run the action", () => {
			const { bus } = setup();
			const handler = vi.fn((value: number) => value * 2);
			const double = createAction("t", handler);
			bus.on(double, () => {});

			expect(bus.emit({ type: "t", payload: 21 })).toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});

		it("emit returns what the handler returns", () => {
			const { bus } = setup();
			const double = createAction("math/double", (value: number) => value * 2);

			expect(bus.emit(double, 4)).toBe(8);
		});

		it("returns the promise of an async handler", async () => {
			const { bus } = setup();
			const load = createAction("user/get", async (id: string) => `user ${id}`);
			const user: string = await bus.emit(load, "1");

			expect(user).toBe("user 1");
		});

		it("gives the handler the payload and a task context", () => {
			const { bus } = setup();
			const seen: unknown[] = [];
			const action = createAction("a/b", (value: number, ctx) => {
				seen.push(value, ctx.type, ctx.payload, ctx.signal.aborted);
			});
			bus.emit(action, 3);

			expect(seen).toEqual([3, "a/b", 3, false]);
		});

		it("gives each emit its own context", () => {
			const { bus } = setup();
			const signals: AbortSignal[] = [];
			const action = createAction("a/b", (_: number, ctx) => {
				signals.push(ctx.signal);
			});
			bus.emit(action, 1);
			bus.emit(action, 2);

			expect(signals[0]).not.toBe(signals[1]);
		});

		it("lets the handler emit events through its context", () => {
			const { bus } = setup();
			const handler = vi.fn();
			bus.on("b", handler);
			const action = createAction("a/b", (_: number, ctx) => {
				ctx.emit("b", "from handler");
			});
			bus.emit(action, 1);

			expect(handler.mock.calls[0]?.[0]).toBe("from handler");
		});

		it("lets the handler run another action", () => {
			const { bus } = setup();
			const inner = createAction("math/inc", (value: number) => value + 1);
			const outer = createAction("math/inc2", (value: number, ctx) => {
				const once = ctx.emit(inner, value) as unknown as number;
				return bus.emit(inner, once);
			});

			expect(bus.emit(outer, 1)).toBe(3);
		});

		it("tells the listeners of its type before the handler runs", () => {
			const { bus } = setup();
			const order: string[] = [];
			const action = createAction("a/b", (value: number) => {
				order.push(`handler ${value}`);
			});
			bus.on(action, (value: number) => order.push(`listener ${value}`));
			bus.emit(action, 1);

			expect(order).toEqual(["listener 1", "handler 1"]);
		});

		it("throws the error of a sync handler from emit", () => {
			const { bus } = setup();
			const action = createAction("a/b", (_: number) => {
				throw new Error("boom");
			});

			expect(() => bus.emit(action, 1)).toThrow("boom");
		});

		it("returns a rejected promise for a failing async handler", async () => {
			const { bus } = setup();
			const action = createAction("a/b", async (_: number) => {
				throw new Error("boom");
			});

			await expect(bus.emit(action, 1)).rejects.toThrow("boom");
		});

		it("works with a policy as the handler", async () => {
			const { bus } = setup();
			const firstGate = deferred<string>();
			const search = createAction(
				"search",
				latest(async (queued: string) =>
					queued === "a" ? firstGate.promise : `result ${queued}`,
				),
			);
			const first = bus.emit(search, "a");
			const second = bus.emit(search, "b");
			firstGate.resolve("stale");

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe("result b");
		});

		it("a contract call builds an action without throwing", () => {
			const action = createAction<Call<number, number>>("a/b");

			expect(action(1)).toEqual({ type: "a/b", payload: 1 });
		});
	});

	describe("an action without a handler", () => {
		it("is an event when nothing is bound: emit does not throw", () => {
			const { bus } = setup();
			const action = createAction<Call<number, number>>("a/b");

			expect(action(1)).toEqual({ type: "a/b", payload: 1 });
			expect(() => bus.emit(action(1))).not.toThrow();
		});

		it("tells the listeners when nothing is bound", () => {
			const { bus } = setup();
			const action = createAction<Call<number, number>>("a/b");
			const handler = vi.fn();
			bus.on(action, handler);
			bus.emit(action(1));

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("runs the handler bound to the bus", () => {
			const { bus, actions } = setup();
			const action = createAction<Call<number, number>>("a/b");
			actions.handle(action, (value) => value * 3);

			expect(bus.emit(action, 2)).toBe(6);
		});
	});

	describe("actions.handle", () => {
		it("a bound handler wins over the one the action has", () => {
			const { bus, actions } = setup();
			const action = createAction("a/b", (value: number) => value);
			actions.handle(action, (value) => value * 100);

			expect(bus.emit(action, 2)).toBe(200);
		});

		it("the returned function unbinds, so the default comes back", () => {
			const { bus, actions } = setup();
			const action = createAction("a/b", (value: number) => value);
			const unbind = actions.handle(action, (value) => value * 100);
			unbind();

			expect(bus.emit(action, 2)).toBe(2);
		});

		it("the latest binding wins, and unbinding it brings the previous back", () => {
			const { bus, actions } = setup();
			const action = createAction<Call<number, string>>("a/b");
			actions.handle(action, () => "first");
			const unbind = actions.handle(action, () => "second");
			expect(bus.emit(action, 1)).toBe("second");
			unbind();

			expect(bus.emit(action, 1)).toBe("first");
		});

		it("unbinding twice, or an older binding, is harmless", () => {
			const { bus, actions } = setup();
			const action = createAction<Call<number, string>>("a/b");
			const old = actions.handle(action, () => "first");
			const unbind = actions.handle(action, () => "second");
			old();
			unbind();
			unbind();

			expect(() => bus.emit(action(1))).not.toThrow();
		});

		it("accepts the type as a string", () => {
			const { bus, actions } = setup();
			const action = createAction<Call<number, number>>("a/b");
			actions.handle("a/b", (value: never) => (value as number) + 1);

			expect(bus.emit(action, 1)).toBe(2);
		});

		it("gives the bound handler the payload and a task context", () => {
			const { bus, actions } = setup();
			const seen: unknown[] = [];
			const action = createAction<Call<number, void>>("a/b");
			actions.handle(action, (value, ctx) => {
				seen.push(value, ctx.type, ctx.signal.aborted);
			});
			bus.emit(action, 5);

			expect(seen).toEqual([5, "a/b", false]);
		});

		it("binds per bus: another bus is untouched", () => {
			const first = setup();
			const second = setup();
			const action = createAction("a/b", (value: number) => value);
			first.actions.handle(action, () => 111);

			expect(first.bus.emit(action, 1)).toBe(111);
			expect(second.bus.emit(action, 1)).toBe(1);
			expect(action(1)).toEqual({ type: "a/b", payload: 1 });
		});

		it("actionsPlugin binds the list it is given", () => {
			const send = createAction<Call<string, string>>("mail/send");
			const bus = createBus<Events>();
			bus.use(actionsPlugin([setHandler(send, (to) => `sent to ${to}`)]));

			expect(bus.emit(send, "ann")).toBe("sent to ann");
		});

		it("binds several actions from the list", () => {
			const first = createAction<Call<number, number>>("a");
			const second = createAction<Call<number, number>>("b");
			const bus = createBus<Events>();
			bus.use(
				actionsPlugin([
					setHandler(first, (value) => value + 1),
					setHandler(second, (value) => value * 2),
				]),
			);

			expect([bus.emit(first, 1), bus.emit(second, 5)]).toEqual([2, 10]);
		});

		it("a binding can name the action by its type string", () => {
			const bus = createBus<Events>();
			bus.use(actionsPlugin([["x/y", () => 1]]));
			const action = createAction<Call<number, number>>("x/y");

			expect(bus.emit(action, 0)).toBe(1);
		});

		it("a handler bound later wins over the list", () => {
			const action = createAction<Call<number, string>>("a/b");
			const bus = createBus<Events>();
			const actions = bus.use(
				actionsPlugin([setHandler(action, () => "listed")]),
			);
			actions.handle(action, () => "later");

			expect(bus.emit(action, 1)).toBe("later");
		});

		it("without actions on the bus an action runs its own handler, with a context", () => {
			const bus = createBus<Events>();
			const seen: unknown[] = [];
			const action = createAction("a/b", (value: number, ctx) => {
				seen.push(value, ctx.type, ctx.signal.aborted);
				return value + 1;
			});

			expect(bus.emit(action, 4)).toBe(5);
			expect(seen).toEqual([4, "a/b", false]);
		});

		it("without actions on the bus an action with no handler is an event", () => {
			const bus = createBus<Events>();
			const action = createAction<Call<number, number>>("a/b");

			expect(() => bus.emit(action(1))).not.toThrow();
		});
	});

	describe("setHandler", () => {
		it("pairs an action with its handler", () => {
			const action = createAction<Call<number, number>>("a/b");
			const handler = (value: number) => value;
			const pair = setHandler(action, handler);

			expect(pair[0]).toBe(action);
			expect(pair[1]).toBe(handler);
		});
	});

	describe("trace", () => {
		it("reports the run of an action", () => {
			const { bus, phases } = setup();
			bus.emit(
				createAction("a/b", (value: number) => value),
				1,
			);

			expect(phases()).toEqual(["action/start", "action/done"]);
		});

		it("reports an error", () => {
			const { bus, phases } = setup();
			const action = createAction("a/b", (_: number) => {
				throw new Error("boom");
			});
			try {
				bus.emit(action, 1);
			} catch {}

			expect(phases()).toEqual(["action/start", "action/error"]);
		});

		it("reports an async run", async () => {
			const { bus, phases } = setup();
			const gate = deferred<number>();
			const action = createAction("a/b", (_: number) => gate.promise);
			const result = bus.emit(action, 1);
			expect(phases()).toEqual(["action/start"]);
			gate.resolve(1);
			await result;

			expect(phases()).toEqual(["action/start", "action/done"]);
		});

		it("reports cancel when the handler aborts its own task", async () => {
			const { bus, phases } = setup();
			const gate = deferred();
			const action = createAction("a/b", (_: number, ctx) => {
				const waiting = gate.promise;
				ctx.abort();
				return waiting;
			});
			const result = bus.emit(action, 1);
			gate.resolve();
			await result;

			expect(phases()).toEqual(["action/start", "action/cancel"]);
		});
	});

	it("a plain function with a type is still a handler of an event of that type", () => {
		const harness = createHarness();
		const handler = Object.assign((value: number) => value * 2, {
			type: "t" as const,
		});

		expect(harness.bus.emit(handler, 4)).toBe(8);
	});
});

describe("action.match", () => {
	it("is true for an action of the type of the action and false for another", () => {
		const getUser = createAction("user/get", async (id: string) => id);

		expect(getUser.match({ type: "user/get", payload: "1" })).toBe(true);
		expect(getUser.match({ type: "user/other" })).toBe(false);
	});

	it("is there on the action of a job as well", () => {
		const loadUser = createJob("user/load", async (id: string) => id);

		expect(loadUser.match({ type: "user/load" })).toBe(true);
		expect(loadUser.match({ type: "user/load/success" })).toBe(false);
	});
});
