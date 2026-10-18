import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { latest } from "../policies";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { bindHandler, createCommand, createCommands } from "./command";

type Events = TestEvents & { "user/get": string };

const setup = () => {
	const recorder = createTraceRecorder<Events>();
	const commands = createCommands<Events>();
	const bus = createBus<Events>({ trace: createTracer(recorder), commands });
	const phases = () =>
		recorder.events.map((event) => `${event.effect}/${event.phase}`);
	return { bus, commands, recorder, phases };
};

describe("createCommand", () => {
	describe("a command with a handler", () => {
		it("emit returns what the handler returns", () => {
			const { bus } = setup();
			const double = createCommand("math/double", (value: number) => value * 2);

			expect(bus.emit(double, 4)).toBe(8);
		});

		it("returns the promise of an async handler", async () => {
			const { bus } = setup();
			const load = createCommand(
				"user/get",
				async (id: string) => `user ${id}`,
			);
			const user: string = await bus.emit(load, "1");

			expect(user).toBe("user 1");
		});

		it("gives the handler the payload and a task context", () => {
			const { bus } = setup();
			const seen: unknown[] = [];
			const command = createCommand("a/b", (value: number, ctx) => {
				seen.push(value, ctx.type, ctx.payload, ctx.signal.aborted);
			});
			bus.emit(command, 3);

			expect(seen).toEqual([3, "a/b", 3, false]);
		});

		it("gives each emit its own context", () => {
			const { bus } = setup();
			const signals: AbortSignal[] = [];
			const command = createCommand("a/b", (_: number, ctx) => {
				signals.push(ctx.signal);
			});
			bus.emit(command, 1);
			bus.emit(command, 2);

			expect(signals[0]).not.toBe(signals[1]);
		});

		it("lets the handler emit events through its context", () => {
			const { bus } = setup();
			const handler = vi.fn();
			bus.on("b", handler);
			const command = createCommand("a/b", (_: number, ctx) => {
				ctx.emit("b", "from handler");
			});
			bus.emit(command, 1);

			expect(handler.mock.calls[0]?.[0]).toBe("from handler");
		});

		it("lets the handler run another command", () => {
			const { bus } = setup();
			const inner = createCommand("math/inc", (value: number) => value + 1);
			const outer = createCommand("math/inc2", (value: number, ctx) => {
				const once = ctx.emit(inner, value) as unknown as number;
				return bus.emit(inner, once);
			});

			expect(bus.emit(outer, 1)).toBe(3);
		});

		it("tells the listeners of its type before the handler runs", () => {
			const { bus } = setup();
			const order: string[] = [];
			const command = createCommand("a/b", (value: number) => {
				order.push(`handler ${value}`);
			});
			bus.on(command, (value: number) => order.push(`listener ${value}`));
			bus.emit(command, 1);

			expect(order).toEqual(["listener 1", "handler 1"]);
		});

		it("throws the error of a sync handler from emit", () => {
			const { bus } = setup();
			const command = createCommand("a/b", (_: number) => {
				throw new Error("boom");
			});

			expect(() => bus.emit(command, 1)).toThrow("boom");
		});

		it("returns a rejected promise for a failing async handler", async () => {
			const { bus } = setup();
			const command = createCommand("a/b", async (_: number) => {
				throw new Error("boom");
			});

			await expect(bus.emit(command, 1)).rejects.toThrow("boom");
		});

		it("works with a policy as the handler", async () => {
			const { bus } = setup();
			const firstGate = deferred<string>();
			const search = createCommand(
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

		it("calls the handler itself with no bus, with a live context", () => {
			let aborted: boolean | null = null;
			const command = createCommand("a/b", (value: number, ctx) => {
				aborted = ctx.signal.aborted;
				return value + 1;
			});

			expect(command(1)).toBe(2);
			expect(aborted).toBe(false);
		});
	});

	describe("a command without a handler", () => {
		it("throws when called directly", () => {
			const command = createCommand<number, number>("a/b");

			expect(() => command(1)).toThrow('No handler for command "a/b"');
		});

		it("throws from emit when nothing is bound, after telling the listeners", () => {
			const { bus } = setup();
			const command = createCommand<number, number>("a/b");
			const handler = vi.fn();
			bus.on(command, handler);

			expect(() => bus.emit(command, 1)).toThrow(
				'No handler for command "a/b"',
			);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("runs the handler bound to the bus", () => {
			const { bus, commands } = setup();
			const command = createCommand<number, number>("a/b");
			commands.handle(command, (value) => value * 3);

			expect(bus.emit(command, 2)).toBe(6);
		});
	});

	describe("commands.handle", () => {
		it("a bound handler wins over the one the command has", () => {
			const { bus, commands } = setup();
			const command = createCommand("a/b", (value: number) => value);
			commands.handle(command, (value) => value * 100);

			expect(bus.emit(command, 2)).toBe(200);
		});

		it("the returned function unbinds, so the default comes back", () => {
			const { bus, commands } = setup();
			const command = createCommand("a/b", (value: number) => value);
			const unbind = commands.handle(command, (value) => value * 100);
			unbind();

			expect(bus.emit(command, 2)).toBe(2);
		});

		it("the latest binding wins, and unbinding it brings the previous back", () => {
			const { bus, commands } = setup();
			const command = createCommand<number, string>("a/b");
			commands.handle(command, () => "first");
			const unbind = commands.handle(command, () => "second");
			expect(bus.emit(command, 1)).toBe("second");
			unbind();

			expect(bus.emit(command, 1)).toBe("first");
		});

		it("unbinding twice, or an older binding, is harmless", () => {
			const { bus, commands } = setup();
			const command = createCommand<number, string>("a/b");
			const old = commands.handle(command, () => "first");
			const unbind = commands.handle(command, () => "second");
			old();
			unbind();
			unbind();

			expect(() => bus.emit(command, 1)).toThrow("No handler");
		});

		it("accepts the type as a string", () => {
			const { bus, commands } = setup();
			const command = createCommand<number, number>("a/b");
			commands.handle("a/b", (value: never) => (value as number) + 1);

			expect(bus.emit(command, 1)).toBe(2);
		});

		it("gives the bound handler the payload and a task context", () => {
			const { bus, commands } = setup();
			const seen: unknown[] = [];
			const command = createCommand<number, void>("a/b");
			commands.handle(command, (value, ctx) => {
				seen.push(value, ctx.type, ctx.signal.aborted);
			});
			bus.emit(command, 5);

			expect(seen).toEqual([5, "a/b", false]);
		});

		it("binds per bus: another bus is untouched", () => {
			const first = setup();
			const second = setup();
			const command = createCommand("a/b", (value: number) => value);
			first.commands.handle(command, () => 111);

			expect(first.bus.emit(command, 1)).toBe(111);
			expect(second.bus.emit(command, 1)).toBe(1);
			expect(command(1)).toBe(1);
		});

		it("createCommands binds the list it is given", () => {
			const send = createCommand<string, string>("mail/send");
			const bus = createBus<Events>({
				commands: createCommands([bindHandler(send, (to) => `sent to ${to}`)]),
			});

			expect(bus.emit(send, "ann")).toBe("sent to ann");
		});

		it("binds several commands from the list", () => {
			const first = createCommand<number, number>("a");
			const second = createCommand<number, number>("b");
			const bus = createBus<Events>({
				commands: createCommands([
					bindHandler(first, (value) => value + 1),
					bindHandler(second, (value) => value * 2),
				]),
			});

			expect([bus.emit(first, 1), bus.emit(second, 5)]).toEqual([2, 10]);
		});

		it("a binding can name the command by its type string", () => {
			const bus = createBus<Events>({
				commands: createCommands<Events>([["x/y", () => 1]]),
			});
			const command = createCommand<number, number>("x/y");

			expect(bus.emit(command, 0)).toBe(1);
		});

		it("a handler bound later wins over the list", () => {
			const command = createCommand<number, string>("a/b");
			const commands = createCommands<Events>([
				bindHandler(command, () => "listed"),
			]);
			const bus = createBus<Events>({ commands });
			commands.handle(command, () => "later");

			expect(bus.emit(command, 1)).toBe("later");
		});

		it("without commands on the bus a command runs its own handler, with a context", () => {
			const bus = createBus<Events>();
			const seen: unknown[] = [];
			const command = createCommand("a/b", (value: number, ctx) => {
				seen.push(value, ctx.type, ctx.signal.aborted);
				return value + 1;
			});

			expect(bus.emit(command, 4)).toBe(5);
			expect(seen).toEqual([4, "a/b", false]);
		});

		it("without commands on the bus a command with no handler throws", () => {
			const bus = createBus<Events>();
			const command = createCommand<number, number>("a/b");

			expect(() => bus.emit(command, 1)).toThrow(
				'No handler for command "a/b"',
			);
		});
	});

	describe("bindHandler", () => {
		it("pairs a command with its handler", () => {
			const command = createCommand<number, number>("a/b");
			const handler = (value: number) => value;
			const pair = bindHandler(command, handler);

			expect(pair[0]).toBe(command);
			expect(pair[1]).toBe(handler);
		});
	});

	describe("trace", () => {
		it("reports the run of a command", () => {
			const { bus, phases } = setup();
			bus.emit(
				createCommand("a/b", (value: number) => value),
				1,
			);

			expect(phases()).toEqual(["command/start", "command/done"]);
		});

		it("reports an error", () => {
			const { bus, phases } = setup();
			const command = createCommand("a/b", (_: number) => {
				throw new Error("boom");
			});
			try {
				bus.emit(command, 1);
			} catch {}

			expect(phases()).toEqual(["command/start", "command/error"]);
		});

		it("reports an async run", async () => {
			const { bus, phases } = setup();
			const gate = deferred<number>();
			const command = createCommand("a/b", (_: number) => gate.promise);
			const result = bus.emit(command, 1);
			expect(phases()).toEqual(["command/start"]);
			gate.resolve(1);
			await result;

			expect(phases()).toEqual(["command/start", "command/done"]);
		});

		it("reports cancel when the handler aborts its own task", async () => {
			const { bus, phases } = setup();
			const gate = deferred();
			const command = createCommand("a/b", (_: number, ctx) => {
				const waiting = gate.promise;
				ctx.abort();
				return waiting;
			});
			const result = bus.emit(command, 1);
			gate.resolve();
			await result;

			expect(phases()).toEqual(["command/start", "command/cancel"]);
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
