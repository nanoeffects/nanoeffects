import { describe, expect, it, vi } from "vitest";
import type { Call } from "../core/action-creator";
import { createBus } from "../core/bus";
import type { TestEvents } from "../tests/test-helpers";
import { createAction } from "./action";
import { actionsPlugin, MissingHandlerError, setHandler } from "./command";
import { createJob } from "./job";

describe("bus.use(actionsPlugin())", () => {
	it("sets the registry as the commands of the bus and returns it", () => {
		const bus = createBus<TestEvents>();
		const commands = bus.use(actionsPlugin());

		expect(bus.actions).toBe(commands);
	});

	it("handlers registered after the bus exists answer emit", () => {
		const bus = createBus<TestEvents>();
		const commands = bus.use(actionsPlugin());
		const getUser = createAction<Call<string, string>>("user/get");
		commands.handle(getUser, (id) => `user ${id}`);

		expect(bus.emit(getUser, "1")).toBe("user 1");
	});

	it("the initial bindings answer", () => {
		const bus = createBus<TestEvents>();
		const send = createAction<Call<string, string>>("mail/send");
		bus.use(actionsPlugin([setHandler(send, (to) => `sent to ${to}`)]));

		expect(bus.emit(send, "ann")).toBe("sent to ann");
	});

	it("a second actionsPlugin binds in the registry that is there and returns it", () => {
		const bus = createBus<TestEvents>();
		const command = createAction<number, number>("a/b", (value) => value);
		const other = createAction<number, number>("a/c", (value) => value);
		const first = bus.use(actionsPlugin());
		first.handle(command, () => 1);
		const second = bus.use(
			actionsPlugin([setHandler(other, (value) => value + 1)]),
		);

		expect(second).toBe(first);
		expect(bus.actions).toBe(first);
		expect(bus.emit(command, 7)).toBe(1);
		expect(bus.emit(other, 7)).toBe(8);
	});

	it("a custom runner is replaced by actionsPlugin", () => {
		const bus = createBus<TestEvents>();
		const command = createAction<number, number>("a/b", (value) => value);
		bus.actions = { run: () => "custom" };
		const registry = bus.use(actionsPlugin());
		registry.handle(command, () => 1);

		expect(bus.actions).toBe(registry);
		expect(bus.emit(command, 7)).toBe(1);
	});

	it("each bus has its own registry", () => {
		const one = createBus<TestEvents>();
		const two = createBus<TestEvents>();
		const command = createAction<number, number>("a/b", (value) => value);
		one.use(actionsPlugin()).handle(command, () => 1);
		two.use(actionsPlugin()).handle(command, () => 2);

		expect([one.emit(command, 0), two.emit(command, 0)]).toEqual([1, 2]);
	});

	it("passes the payload and a task context to a handler", () => {
		const bus = createBus<TestEvents>();
		const commands = bus.use(actionsPlugin());
		const command = createAction<Call<number, number>>("a/b");
		const handler = vi.fn((value: number, ctx: { signal: AbortSignal }) => {
			void ctx;
			return value;
		});
		commands.handle(command, handler);
		bus.emit(command, 3);

		expect(handler.mock.calls[0]?.[0]).toBe(3);
		expect(handler.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
	});
});

describe("a bus without a registry", () => {
	it("runs the handler that a command carries", () => {
		const bus = createBus<TestEvents>();
		const double = createAction("math/double", (value: number) => value * 2);

		expect(bus.emit(double, 21)).toBe(42);
	});

	it("throws MissingHandlerError for a job without a handler", () => {
		const bus = createBus<TestEvents>();
		const contract = createJob<number, number>("a/contract");

		expect(() => bus.emit(contract, 1)).toThrow(MissingHandlerError);
		expect(() => bus.emit(contract, 1)).toThrow(
			'No handler for command "a/contract"',
		);
	});

	it("does not throw for an action without a handler", () => {
		const bus = createBus<TestEvents>();
		const contract = createAction<Call<number, number>>("a/contract");

		expect(() => bus.emit(contract(1))).not.toThrow();
	});

	it("a runner assigned to bus.actions runs the commands", () => {
		const bus = createBus<TestEvents>();
		const command = createAction<number, number>("a/b", (value) => value);
		const run = vi.fn(() => 5);
		bus.actions = { run };

		expect(bus.emit(command, 1)).toBe(5);
		expect(run).toHaveBeenCalledWith(command, 1, expect.anything());
	});

	describe("an action made without a handler", () => {
		it("a bound handler answers by the creator, the type string and a plain action", () => {
			const bus = createBus();
			const actions = bus.use(actionsPlugin());
			const loaded = createAction<number>("user/loaded");
			actions.handle(loaded, (value) => `got ${String(value)}`);

			expect(bus.emit(loaded(1))).toBe("got 1");
			expect(bus.emit({ type: "user/loaded", payload: 2 })).toBe("got 2");
			expect(bus.emit("user/loaded", 3)).toBe("got 3");
		});

		it("tells the listeners before the handler runs", () => {
			const bus = createBus();
			const actions = bus.use(actionsPlugin());
			const order: string[] = [];
			const loaded = createAction<number>("user/loaded");
			bus.on(loaded, () => order.push("listener"));
			actions.handle(loaded, () => order.push("handler"));
			bus.emit(loaded(1));

			expect(order).toEqual(["listener", "handler"]);
		});

		it("is an event again when the handler is unbound", () => {
			const onUnhandled = vi.fn();
			const bus = createBus({ onUnhandled });
			const actions = bus.use(actionsPlugin());
			const loaded = createAction<number>("user/loaded");
			const unbind = actions.handle(loaded, () => "bound");
			unbind();

			expect(bus.emit(loaded(1))).toBeUndefined();
			expect(onUnhandled).toHaveBeenCalledTimes(1);
		});

		it("a runner without bound still runs commands and leaves events alone", () => {
			const bus = createBus();
			const run = vi.fn(() => "custom");
			bus.actions = { run };
			const command = createAction("a/b", (value: number) => value);
			const loaded = createAction<number>("user/loaded");

			expect(bus.emit(command(1))).toBe("custom");
			expect(() => bus.emit(loaded(1))).not.toThrow();
			expect(run).toHaveBeenCalledTimes(1);
		});
	});
});
