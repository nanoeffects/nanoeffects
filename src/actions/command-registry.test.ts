import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { TestEvents } from "../tests/test-helpers";
import {
	bindHandler,
	commandsPlugin,
	createCommand,
	MissingHandlerError,
} from "./command";

describe("bus.use(commandsPlugin())", () => {
	it("sets the registry as the commands of the bus and returns it", () => {
		const bus = createBus<TestEvents>();
		const commands = bus.use(commandsPlugin());

		expect(bus.commands).toBe(commands);
	});

	it("handlers registered after the bus exists answer emit", () => {
		const bus = createBus<TestEvents>();
		const commands = bus.use(commandsPlugin());
		const getUser = createCommand<string, string>("user/get");
		commands.handle(getUser, (id) => `user ${id}`);

		expect(bus.emit(getUser, "1")).toBe("user 1");
	});

	it("the initial bindings answer", () => {
		const bus = createBus<TestEvents>();
		const send = createCommand<string, string>("mail/send");
		bus.use(commandsPlugin([bindHandler(send, (to) => `sent to ${to}`)]));

		expect(bus.emit(send, "ann")).toBe("sent to ann");
	});

	it("a second commandsPlugin binds in the registry that is there and returns it", () => {
		const bus = createBus<TestEvents>();
		const command = createCommand<number, number>("a/b", (value) => value);
		const other = createCommand<number, number>("a/c", (value) => value);
		const first = bus.use(commandsPlugin());
		first.handle(command, () => 1);
		const second = bus.use(
			commandsPlugin([bindHandler(other, (value) => value + 1)]),
		);

		expect(second).toBe(first);
		expect(bus.commands).toBe(first);
		expect(bus.emit(command, 7)).toBe(1);
		expect(bus.emit(other, 7)).toBe(8);
	});

	it("a custom runner is replaced by commandsPlugin", () => {
		const bus = createBus<TestEvents>();
		const command = createCommand<number, number>("a/b", (value) => value);
		bus.commands = { run: () => "custom" };
		const registry = bus.use(commandsPlugin());
		registry.handle(command, () => 1);

		expect(bus.commands).toBe(registry);
		expect(bus.emit(command, 7)).toBe(1);
	});

	it("each bus has its own registry", () => {
		const one = createBus<TestEvents>();
		const two = createBus<TestEvents>();
		const command = createCommand<number, number>("a/b", (value) => value);
		one.use(commandsPlugin()).handle(command, () => 1);
		two.use(commandsPlugin()).handle(command, () => 2);

		expect([one.emit(command, 0), two.emit(command, 0)]).toEqual([1, 2]);
	});

	it("passes the payload and a task context to a handler", () => {
		const bus = createBus<TestEvents>();
		const commands = bus.use(commandsPlugin());
		const command = createCommand<number, number>("a/b");
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
		const double = createCommand("math/double", (value: number) => value * 2);

		expect(bus.emit(double, 21)).toBe(42);
	});

	it("throws MissingHandlerError for a command without a handler", () => {
		const bus = createBus<TestEvents>();
		const contract = createCommand<number, number>("a/contract");

		expect(() => bus.emit(contract, 1)).toThrow(MissingHandlerError);
		expect(() => bus.emit(contract, 1)).toThrow(
			'No handler for command "a/contract"',
		);
	});

	it("a runner assigned to bus.commands runs the commands", () => {
		const bus = createBus<TestEvents>();
		const command = createCommand<number, number>("a/b", (value) => value);
		const run = vi.fn(() => 5);
		bus.commands = { run };

		expect(bus.emit(command, 1)).toBe(5);
		expect(run).toHaveBeenCalledWith(command, 1, expect.anything());
	});
});
