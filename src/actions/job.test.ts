import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { deferred } from "../tests/test-helpers";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { createAction } from "./action";
import { commandsPlugin } from "./command";
import { createJob } from "./job";

type Events = Record<string, unknown>;

const setup = () => {
	const recorder = createTraceRecorder<Events>();
	const bus = createBus<Events>({ trace: createTracer(recorder) });
	const commands = bus.use(commandsPlugin());

	return { bus, commands, recorder };
};

const loadUser = async (id: string) => `user ${id}`;
const failing = async () => {
	throw new Error("boom");
};

describe("createJob", () => {
	describe("what it returns", () => {
		it("is the command and the two actions", () => {
			const command = createJob("user/load", loadUser);
			const { success: successAction, fail: failAction } = command;

			expect(command.type).toBe("user/load");
			expect(typeof command).toBe("function");
			expect(typeof successAction).toBe("function");
			expect(typeof failAction).toBe("function");
		});

		it("makes action creators from strings, with the result and the error as payload", () => {
			const command = createJob("user/load", loadUser, {
				success: "user/loaded",
				fail: "user/failed",
			});
			const { success: successAction, fail: failAction } = command;

			expect(successAction.type).toBe("user/loaded");
			expect(failAction.type).toBe("user/failed");
			expect(successAction("user 1")).toEqual({
				type: "user/loaded",
				payload: "user 1",
			});
			expect(failAction(new Error("boom")).payload).toBeInstanceOf(Error);
		});

		it("returns an action creator that was given, the very same one", () => {
			const loaded = createAction<string, "user/loaded">("user/loaded");
			const failed = createAction<Error, "user/failed">("user/failed");
			const command = createJob("user/load", loadUser, {
				success: loaded,
				fail: failed,
			});
			const { success: successAction, fail: failAction } = command;

			expect(successAction).toBe(loaded);
			expect(failAction).toBe(failed);
		});

		it("makes the missing ones with the types <type>/success and <type>/fail", () => {
			const command = createJob("user/load", loadUser);
			const { success: successAction, fail: failAction } = command;

			expect(successAction.type).toBe("user/load/success");
			expect(failAction.type).toBe("user/load/fail");
		});

		it("a string for one and the default for the other", () => {
			const command = createJob("user/load", loadUser, {
				success: "loaded",
			});
			const { success: successAction, fail: failAction } = command;

			expect(successAction.type).toBe("loaded");
			expect(failAction.type).toBe("user/load/fail");
		});
	});

	describe("success", () => {
		it("emits the success action with the result, and a listener of the made action gets it", async () => {
			const { bus } = setup();
			const command = createJob("user/load", loadUser);
			const { success: successAction } = command;
			const handler = vi.fn();
			bus.on(successAction, handler);
			await bus.emit(command, "1");

			expect(handler.mock.calls[0]?.[0]).toBe("user 1");
		});

		it("a listener of the type as a string gets it too", async () => {
			const { bus } = setup();
			const command = createJob("user/load", loadUser, {
				success: "loaded",
			});
			const handler = vi.fn();
			bus.on("loaded", handler);
			await bus.emit(command, "1");

			expect(handler.mock.calls[0]?.[0]).toBe("user 1");
		});

		it("works with a given action creator", async () => {
			const { bus } = setup();
			const loaded = createAction<string, "user/loaded">("user/loaded");
			const command = createJob("user/load", loadUser, { success: loaded });
			const handler = vi.fn();
			bus.on(loaded, handler);
			await bus.emit(command, "1");

			expect(handler.mock.calls[0]?.[0]).toBe("user 1");
		});

		it("works for a sync handler too, and still returns a promise", async () => {
			const { bus } = setup();
			const command = createJob("user/load", (id: string) => `user ${id}`);
			const { success: successAction } = command;
			const handler = vi.fn();
			bus.on(successAction, handler);
			const result = bus.emit(command, "1");

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBe("user 1");
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("is sent before the caller continues", async () => {
			const { bus } = setup();
			const order: string[] = [];
			const command = createJob("user/load", loadUser);
			const { success: successAction } = command;
			bus.on(successAction, () => {
				order.push("action");
			});
			await bus.emit(command, "1");
			order.push("caller");

			expect(order).toEqual(["action", "caller"]);
		});

		it("is not sent while the handler is still running", async () => {
			const { bus } = setup();
			const gate = deferred<string>();
			const command = createJob("user/load", () => gate.promise);
			const { success: successAction } = command;
			const handler = vi.fn();
			bus.on(successAction, handler);
			const result = bus.emit(command, void 0);
			expect(handler).not.toHaveBeenCalled();
			gate.resolve("late");
			await result;

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("does not send the fail action on success", async () => {
			const { bus } = setup();
			const command = createJob("user/load", loadUser);
			const { fail: failAction } = command;
			const handler = vi.fn();
			bus.on(failAction, handler);
			await bus.emit(command, "1");

			expect(handler).not.toHaveBeenCalled();
		});

		it("gives each emit its own result", async () => {
			const { bus } = setup();
			const seen: string[] = [];
			const command = createJob("user/load", loadUser);
			const { success: successAction } = command;
			bus.on(successAction, (result) => seen.push(result));
			await Promise.all([bus.emit(command, "1"), bus.emit(command, "2")]);

			expect(seen.sort()).toEqual(["user 1", "user 2"]);
		});
	});

	describe("failure", () => {
		it("sends the error to the fail action and resolves with undefined", async () => {
			const { bus } = setup();
			const command = createJob("user/load", failing);
			const { fail: failAction } = command;
			const handler = vi.fn();
			bus.on(failAction, handler);
			const result = await bus.emit(command, void 0);

			expect(result).toBeUndefined();
			expect(handler.mock.calls[0]?.[0]).toBeInstanceOf(Error);
		});

		it("an error is always handled, also when no options were given", async () => {
			const { bus } = setup();
			const command = createJob("user/load", failing);

			await expect(bus.emit(command, void 0)).resolves.toBeUndefined();
		});

		it("does not send the success action on failure", async () => {
			const { bus } = setup();
			const command = createJob("user/load", failing);
			const { success: successAction } = command;
			const handler = vi.fn();
			bus.on(successAction, handler);
			await bus.emit(command, void 0);

			expect(handler).not.toHaveBeenCalled();
		});

		it("routes an error thrown synchronously too", async () => {
			const { bus } = setup();
			const command = createJob("user/load", () => {
				throw new Error("sync boom");
			});
			const { fail: failAction } = command;
			const handler = vi.fn();
			bus.on(failAction, handler);
			await bus.emit(command, void 0);

			expect(handler.mock.calls[0]?.[0]).toMatchObject({
				message: "sync boom",
			});
		});

		it("works with a given action creator", async () => {
			const { bus } = setup();
			const failed = createAction<Error, "user/failed">("user/failed");
			const command = createJob("user/load", failing, { fail: failed });
			const handler = vi.fn();
			bus.on(failed, handler);
			await bus.emit(command, void 0);

			expect(handler.mock.calls[0]?.[0]).toBeInstanceOf(Error);
		});

		it("an error of a listener of the success action rejects the call and is not sent to fail", async () => {
			const { bus } = setup();
			const command = createJob("user/load", loadUser);
			const { success: successAction, fail: failAction } = command;
			const failed = vi.fn();
			bus.on(successAction, () => {
				throw new Error("listener boom");
			});
			bus.on(failAction, failed);

			await expect(bus.emit(command, "1")).rejects.toThrow("listener boom");
			expect(failed).not.toHaveBeenCalled();
		});
	});

	describe("handlers", () => {
		it("routes the outcome of a handler bound with commands.handle", async () => {
			const { bus, commands } = setup();
			const command = createJob<string, string>("user/load");
			const { success: successAction } = command;
			commands.handle(command, async (id) => `bound ${id}`);
			const handler = vi.fn();
			bus.on(successAction, handler);
			await bus.emit(command, "1");

			expect(handler.mock.calls[0]?.[0]).toBe("bound 1");
		});

		it("routes the failure of a bound handler", async () => {
			const { bus, commands } = setup();
			const command = createJob<string, string>("user/load");
			const { fail: failAction } = command;
			commands.handle(command, async () => {
				throw new Error("bound boom");
			});
			const handler = vi.fn();
			bus.on(failAction, handler);
			await bus.emit(command, "1");

			expect(handler.mock.calls[0]?.[0]).toMatchObject({
				message: "bound boom",
			});
		});

		it("a bound handler replaces the default one, and the actions stay", async () => {
			const { bus, commands } = setup();
			const command = createJob("user/load", loadUser);
			const { success: successAction } = command;
			commands.handle(command, async () => "replaced");
			const handler = vi.fn();
			bus.on(successAction, handler);
			await bus.emit(command, "1");

			expect(handler.mock.calls[0]?.[0]).toBe("replaced");
		});

		it("throws at once when there is no handler at all, and sends nothing", () => {
			const { bus } = setup();
			const command = createJob<string, string>("user/load");
			const { fail: failAction } = command;
			const failed = vi.fn();
			bus.on(failAction, failed);

			expect(() => bus.emit(command, "1")).toThrow(
				'No handler for command "user/load"',
			);
			expect(failed).not.toHaveBeenCalled();
		});

		it("gives the handler the payload and a task context", async () => {
			const { bus } = setup();
			const seen: unknown[] = [];
			const command = createJob("user/load", async (id: string, ctx) => {
				seen.push(id, ctx.type);
				return id;
			});
			await bus.emit(command, "3");

			expect(seen).toEqual(["3", "user/load"]);
		});
	});

	describe("a bus without a registry", () => {
		it("still routes the outcome of the own handler, and the failure", async () => {
			const bus = createBus<Events>();
			const ok = createJob("user/ok", loadUser);
			const bad = createJob("user/bad", failing);
			const success = vi.fn();
			const fail = vi.fn();
			bus.on(ok.success, success);
			bus.on(bad.fail, fail);
			await bus.emit(ok, "1");
			await bus.emit(bad, void 0);

			expect(success.mock.calls[0]?.[0]).toBe("user 1");
			expect(fail.mock.calls[0]?.[0]).toBeInstanceOf(Error);
		});
	});

	describe("abort", () => {
		it("sends no success action once the task was aborted", async () => {
			const { bus } = setup();
			const command = createJob("user/load", async (_: string, ctx) => {
				ctx.abort();
				return "x";
			});
			const { success: successAction } = command;
			const handler = vi.fn();
			bus.on(successAction, handler);

			await expect(bus.emit(command, "1")).resolves.toBe("x");
			expect(handler).not.toHaveBeenCalled();
		});

		it("sends no fail action once the task was aborted", async () => {
			const { bus } = setup();
			const command = createJob("user/load", async (_: string, ctx) => {
				ctx.abort();
				throw new Error("boom");
			});
			const { fail: failAction } = command;
			const handler = vi.fn();
			bus.on(failAction, handler);

			await expect(bus.emit(command, "1")).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("direct call", () => {
		it("builds an action and does not run the handler", () => {
			const handler = vi.fn((id: string) => `user ${id}`);
			const command = createJob("user/load", handler);
			const { success: successAction } = command;

			expect(command("1")).toEqual({ type: "user/load", payload: "1" });
			expect(handler).not.toHaveBeenCalled();
			expect(successAction.type).toBe("user/load/success");
		});

		it("emit of the call runs the job and routes success", async () => {
			const { bus } = setup();
			const command = createJob("user/load", (id: string) => `user ${id}`);
			const handler = vi.fn();
			bus.on(command.success, handler);

			await expect(bus.emit(command("1"))).resolves.toBe("user 1");
			expect(handler).toHaveBeenCalledWith("user 1", expect.anything());
		});

		it("a contract job call builds an action; emit throws with no handler", () => {
			const { bus } = setup();
			const command = createJob<string, string>("user/load");

			expect(command("1")).toEqual({ type: "user/load", payload: "1" });
			expect(() => bus.emit(command("1"))).toThrow("No handler");
		});
	});

	describe("trace", () => {
		it("reports the run as a command", async () => {
			const { bus, recorder } = setup();
			const command = createJob("user/load", async () => "x");
			await bus.emit(command, void 0);

			expect(
				recorder.events.map((event) => `${event.effect}/${event.phase}`),
			).toEqual(["command/start", "command/done"]);
		});
	});
});
