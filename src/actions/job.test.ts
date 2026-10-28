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

	describe("pending", () => {
		it("makes the defaults <type>/pending and <type>/cancel", () => {
			const command = createJob("user/load", loadUser);
			const { pending: pendingAction, cancel: cancelAction } = command;

			expect(pendingAction.type).toBe("user/load/pending");
			expect(cancelAction.type).toBe("user/load/cancel");
		});

		it("makes action creators from strings", () => {
			const command = createJob("user/load", loadUser, {
				pending: "user/loading",
				cancel: "user/cancelled",
			});
			const { pending: pendingAction, cancel: cancelAction } = command;

			expect(pendingAction.type).toBe("user/loading");
			expect(cancelAction.type).toBe("user/cancelled");
			expect(pendingAction("1")).toEqual({
				type: "user/loading",
				payload: "1",
			});
		});

		it("returns the action creators that were given, the very same ones", () => {
			const loading = createAction<string, "user/loading">("user/loading");
			const cancelled = createAction<unknown, "user/cancelled">(
				"user/cancelled",
			);
			const command = createJob("user/load", loadUser, {
				pending: loading,
				cancel: cancelled,
			});

			expect(command.pending).toBe(loading);
			expect(command.cancel).toBe(cancelled);
		});

		it("is sent with the payload of the call, before the handler is called", async () => {
			const { bus } = setup();
			const order: string[] = [];
			const command = createJob("user/load", async (id: string) => {
				order.push("handler");
				return id;
			});
			bus.on(command.pending, (id) => {
				order.push(`pending ${id}`);
			});
			bus.on(command.success, () => {
				order.push("success");
			});
			await bus.emit(command, "1");

			expect(order).toEqual(["pending 1", "handler", "success"]);
		});

		it("is sent before the first await of the handler, in the same call of emit", () => {
			const { bus } = setup();
			const handler = vi.fn();
			const command = createJob("user/load", () => deferred<string>().promise);
			bus.on(command.pending, handler);
			bus.emit(command, void 0);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("is sent for a handler bound with commands.handle", async () => {
			const { bus, commands } = setup();
			const command = createJob<string, string>("user/load");
			commands.handle(command, async (id) => id);
			const seen: string[] = [];
			bus.on(command.pending, () => {
				seen.push("pending");
			});
			bus.on(command.success, () => {
				seen.push("success");
			});
			await bus.emit(command, "1");

			expect(seen).toEqual(["pending", "success"]);
		});

		it("is sent for a failure too, followed by fail", async () => {
			const { bus } = setup();
			const seen: string[] = [];
			const command = createJob("user/load", failing);
			bus.on(command.pending, () => {
				seen.push("pending");
			});
			bus.on(command.fail, () => {
				seen.push("fail");
			});
			await bus.emit(command, void 0);

			expect(seen).toEqual(["pending", "fail"]);
		});

		it("is not sent when there is no handler", () => {
			const { bus } = setup();
			const command = createJob<string, string>("user/load");
			const handler = vi.fn();
			bus.on(command.pending, handler);

			expect(() => bus.emit(command, "1")).toThrow("No handler");
			expect(handler).not.toHaveBeenCalled();
		});

		it("a throwing listener is a failure of the call: the handler is not called, fail gets the error", async () => {
			const { bus } = setup();
			const handler = vi.fn(loadUser);
			const command = createJob("user/load", handler);
			const failed = vi.fn();
			bus.on(command.pending, () => {
				throw new Error("pending boom");
			});
			bus.on(command.fail, failed);

			await expect(bus.emit(command, "1")).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
			expect(failed.mock.calls[0]?.[0]).toMatchObject({
				message: "pending boom",
			});
		});

		it("is an event like success: onUnhandled hears it when nobody listens", async () => {
			const onUnhandled = vi.fn();
			const bus = createBus<Events>({ onUnhandled });
			const command = createJob("user/load", loadUser);

			await expect(bus.emit(command, "1")).resolves.toBe("user 1");
			expect(onUnhandled.mock.calls.map(([action]) => action.type)).toEqual([
				"user/load/pending",
				"user/load/success",
			]);
		});
	});

	describe("cancel", () => {
		type Harness = ReturnType<typeof prepare>;

		// a job whose handler hands its task context out, so a test can abort it
		const prepare = (
			settle: (
				ctx: { signal: AbortSignal },
				gate: Promise<string>,
			) => Promise<string>,
		) => {
			const { bus } = setup();
			const gate = deferred<string>();
			const holder: { abort?: (reason?: unknown) => void } = {};
			const command = createJob("user/load", (_: string, ctx) => {
				holder.abort = ctx.abort;
				return settle(ctx, gate.promise);
			});
			const seen: string[] = [];
			const reasons: unknown[] = [];
			for (const name of ["pending", "success", "fail"] as const) {
				bus.on(command[name], () => {
					seen.push(name);
				});
			}
			bus.on(command.cancel, (reason) => {
				seen.push("cancel");
				reasons.push(reason);
			});
			const abort = (reason?: unknown) => holder.abort?.(reason);

			return { bus, command, gate, seen, reasons, abort };
		};

		// rejects with the abort reason, as `fetch` does
		const rejecting = (ctx: { signal: AbortSignal }, gate: Promise<string>) =>
			Promise.race([
				gate,
				new Promise<never>((_, reject) => {
					ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason));
				}),
			]);

		// never looks at the signal
		const ignoring = (_: unknown, gate: Promise<string>) => gate;

		const start = (harness: Harness) => harness.bus.emit(harness.command, "1");

		it("is sent instead of fail when the handler rejects with the abort reason", async () => {
			const harness = prepare(rejecting);
			const result = start(harness);
			const reason = new Error("stop");
			harness.abort(reason);

			await expect(result).resolves.toBeUndefined();
			expect(harness.seen).toEqual(["pending", "cancel"]);
			expect(harness.reasons).toEqual([reason]);
		});

		it("is sent instead of fail when the handler ignores the signal and rejects later", async () => {
			const harness = prepare(ignoring);
			const result = start(harness);
			harness.abort("stop");
			harness.gate.reject(new Error("late boom"));

			await expect(result).resolves.toBeUndefined();
			expect(harness.seen).toEqual(["pending", "cancel"]);
		});

		it("is sent once instead of success when the handler ignores the signal and resolves later", async () => {
			const harness = prepare(ignoring);
			const result = start(harness);
			harness.abort("stop");
			harness.gate.resolve("late");

			await expect(result).resolves.toBe("late");
			expect(harness.seen).toEqual(["pending", "cancel"]);
			expect(harness.reasons).toEqual(["stop"]);
		});

		it("is sent at the abort, not when the handler settles", async () => {
			const harness = prepare(ignoring);
			const result = start(harness);
			harness.abort("stop");

			expect(harness.seen).toEqual(["pending", "cancel"]);
			harness.gate.resolve("late");
			await result;
			expect(harness.seen).toEqual(["pending", "cancel"]);
		});

		it("is not sent without an abort", async () => {
			const harness = prepare(ignoring);
			const result = start(harness);
			harness.gate.resolve("done");
			await result;

			expect(harness.seen).toEqual(["pending", "success"]);
		});

		it("clears a flag that pending set, when the task is aborted", async () => {
			const harness = prepare(rejecting);
			let loading = false;
			harness.bus.on(harness.command.pending, () => {
				loading = true;
			});
			for (const name of ["success", "fail", "cancel"] as const) {
				harness.bus.on(harness.command[name], () => {
					loading = false;
				});
			}
			const result = start(harness);
			expect(loading).toBe(true);
			harness.abort();
			await result;

			expect(loading).toBe(false);
		});

		it("does not reject the call when a listener of cancel throws, and logs the error", async () => {
			const harness = prepare(rejecting);
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			harness.bus.on(harness.command.cancel, () => {
				throw new Error("cancel boom");
			});
			const result = start(harness);
			harness.abort();

			await expect(result).resolves.toBeUndefined();
			expect(log).toHaveBeenCalledTimes(1);
			log.mockRestore();
		});

		it("works with nobody listening", async () => {
			const bus = createBus<Events>();
			const command = createJob("user/load", async (_: string, ctx) => {
				ctx.abort();
				return "x";
			});

			await expect(bus.emit(command, "1")).resolves.toBe("x");
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
