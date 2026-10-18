import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { deferred } from "../tests/test-helpers";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { createAction } from "./action";
import { createCommand, createCommands } from "./command";
import { createJob } from "./job";

type Events = {
	loaded: string;
	failed: Error;
	log: string;
};

const setup = () => {
	const recorder = createTraceRecorder<Events>();
	const commands = createCommands<Events>();
	const bus = createBus<Events>({ trace: createTracer(recorder), commands });
	return { bus, commands, recorder };
};

describe("createJob", () => {
	describe("done", () => {
		it("sends the result to an event type", async () => {
			const { bus } = setup();
			const handler = vi.fn();
			bus.on("loaded", handler);
			const job = createJob("user/load", async (id: string) => `user ${id}`, {
				done: "loaded",
			});
			await bus.emit(job, "1");

			expect(handler.mock.calls[0]?.[0]).toBe("user 1");
		});

		it("sends the result to an action creator", async () => {
			const { bus } = setup();
			const loaded = createAction<string, "user/loaded">("user/loaded");
			const handler = vi.fn();
			bus.on(loaded, handler);
			const job = createJob("user/load", async (id: string) => `user ${id}`, {
				done: loaded,
			});
			await bus.emit(job, "1");

			expect(handler.mock.calls[0]?.[0]).toBe("user 1");
		});

		it("sends the result to a command and runs its handler", async () => {
			const { bus } = setup();
			const show = vi.fn((text: string) => text.length);
			const display = createCommand("ui/show", show);
			const job = createJob("user/load", async () => "hello", {
				done: display,
			});
			await bus.emit(job, void 0);

			expect(show.mock.calls[0]?.[0]).toBe("hello");
		});

		it("sends the result as the payload of a plain action", async () => {
			const { bus } = setup();
			const handler = vi.fn();
			bus.on("loaded", handler);
			const job = createJob("user/load", async () => "payload", {
				done: { type: "loaded" },
			});
			await bus.emit(job, void 0);

			expect(handler.mock.calls[0]?.[0]).toBe("payload");
		});

		it("works for a sync handler too, and still returns a promise", async () => {
			const { bus } = setup();
			const handler = vi.fn();
			bus.on("loaded", handler);
			const job = createJob("user/load", (value: number) => `n=${value}`, {
				done: "loaded",
			});
			const result = bus.emit(job, 2);

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBe("n=2");
			expect(handler.mock.calls[0]?.[0]).toBe("n=2");
		});

		it("sends the result before the caller continues", async () => {
			const { bus } = setup();
			const order: string[] = [];
			bus.on("loaded", () => order.push("outlet"));
			const job = createJob("user/load", async () => "x", { done: "loaded" });
			await bus.emit(job, void 0).then(() => order.push("caller"));

			expect(order).toEqual(["outlet", "caller"]);
		});

		it("sends nothing while the handler is still running", async () => {
			const { bus } = setup();
			const handler = vi.fn();
			bus.on("loaded", handler);
			const gate = deferred<string>();
			const job = createJob("user/load", () => gate.promise, {
				done: "loaded",
			});
			const result = bus.emit(job, void 0);
			expect(handler).not.toHaveBeenCalled();
			gate.resolve("late");
			await result;

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("does not send the error outlet on success", async () => {
			const { bus } = setup();
			const failed = vi.fn();
			bus.on("failed", failed);
			const job = createJob("user/load", async () => "ok", {
				done: "loaded",
				fail: "failed",
			});
			await bus.emit(job, void 0);

			expect(failed).not.toHaveBeenCalled();
		});

		it("gives each emit its own result", async () => {
			const { bus } = setup();
			const seen: string[] = [];
			bus.on("loaded", (result) => seen.push(result));
			const job = createJob("user/load", async (id: string) => `user ${id}`, {
				done: "loaded",
			});
			await Promise.all([bus.emit(job, "1"), bus.emit(job, "2")]);

			expect(seen.sort()).toEqual(["user 1", "user 2"]);
		});
	});

	describe("fail", () => {
		it("sends the error to the fail outlet and resolves with undefined", async () => {
			const { bus } = setup();
			const failed = vi.fn();
			bus.on("failed", failed);
			const error = new Error("boom");
			const job = createJob(
				"user/load",
				async () => {
					throw error;
				},
				{ fail: "failed" },
			);

			await expect(bus.emit(job, void 0)).resolves.toBeUndefined();
			expect(failed.mock.calls[0]?.[0]).toBe(error);
		});

		it("does not send the result outlet on failure", async () => {
			const { bus } = setup();
			const loaded = vi.fn();
			bus.on("loaded", loaded);
			const job = createJob(
				"user/load",
				async () => {
					throw new Error("boom");
				},
				{ done: "loaded", fail: "failed" },
			);
			await bus.emit(job, void 0);

			expect(loaded).not.toHaveBeenCalled();
		});

		it("routes an error thrown synchronously too", async () => {
			const { bus } = setup();
			const failed = vi.fn();
			bus.on("failed", failed);
			const job = createJob(
				"user/load",
				() => {
					throw new Error("sync boom");
				},
				{ fail: "failed" },
			);
			await bus.emit(job, void 0);

			expect(failed.mock.calls[0]?.[0]).toEqual(new Error("sync boom"));
		});

		it("sends the error to an action creator", async () => {
			const { bus } = setup();
			const failed = createAction<Error, "user/failed">("user/failed");
			const handler = vi.fn();
			bus.on(failed, handler);
			const job = createJob(
				"user/load",
				async () => {
					throw new Error("boom");
				},
				{ fail: failed },
			);
			await bus.emit(job, void 0);

			expect(handler.mock.calls[0]?.[0]).toEqual(new Error("boom"));
		});

		it("rejects when there is no fail outlet", async () => {
			const { bus } = setup();
			const job = createJob(
				"user/load",
				async () => {
					throw new Error("boom");
				},
				{ done: "loaded" },
			);

			await expect(bus.emit(job, void 0)).rejects.toThrow("boom");
		});

		it("behaves like a command when there are no outlets", async () => {
			const { bus } = setup();
			const ok = createJob("a", async () => 1);
			const bad = createJob("b", async () => {
				throw new Error("boom");
			});

			await expect(bus.emit(ok, void 0)).resolves.toBe(1);
			await expect(bus.emit(bad, void 0)).rejects.toThrow("boom");
		});

		it("an error thrown by a result listener rejects the call and is not sent to fail", async () => {
			const { bus } = setup();
			const failed = vi.fn();
			bus.on("failed", failed);
			bus.on("loaded", () => {
				throw new Error("listener boom");
			});
			const job = createJob("user/load", async () => "x", {
				done: "loaded",
				fail: "failed",
			});

			await expect(bus.emit(job, void 0)).rejects.toThrow("listener boom");
			expect(failed).not.toHaveBeenCalled();
		});
	});

	describe("handlers", () => {
		it("routes the outcome of a handler bound with commands.handle", async () => {
			const { bus, commands } = setup();
			const handler = vi.fn();
			bus.on("loaded", handler);
			const job = createJob<string, string>("user/load", void 0, {
				done: "loaded",
			});
			commands.handle(job, async (id) => `bound ${id}`);
			await bus.emit(job, "7");

			expect(handler.mock.calls[0]?.[0]).toBe("bound 7");
		});

		it("routes the failure of a bound handler", async () => {
			const { bus, commands } = setup();
			const failed = vi.fn();
			bus.on("failed", failed);
			const job = createJob<string, string>("user/load", void 0, {
				fail: "failed",
			});
			commands.handle(job, async () => {
				throw new Error("bound boom");
			});
			await bus.emit(job, "7");

			expect(failed.mock.calls[0]?.[0]).toEqual(new Error("bound boom"));
		});

		it("a bound handler replaces the default one, and the outlets stay", async () => {
			const { bus, commands } = setup();
			const handler = vi.fn();
			bus.on("loaded", handler);
			const job = createJob("user/load", async () => "default", {
				done: "loaded",
			});
			commands.handle(job, async () => "override");
			await bus.emit(job, void 0);

			expect(handler.mock.calls[0]?.[0]).toBe("override");
		});

		it("throws at once when there is no handler at all, and sends nothing", () => {
			const { bus } = setup();
			const failed = vi.fn();
			bus.on("failed", failed);
			const job = createJob<string, string>("user/load", void 0, {
				fail: "failed",
			});

			expect(() => bus.emit(job, "1")).toThrow(
				'No handler for command "user/load"',
			);
			expect(failed).not.toHaveBeenCalled();
		});

		it("gives the handler the payload and a task context", async () => {
			const { bus } = setup();
			const seen: unknown[] = [];
			const job = createJob("user/load", async (id: string, ctx) => {
				seen.push(id, ctx.type);
				return id;
			});
			await bus.emit(job, "3");

			expect(seen).toEqual(["3", "user/load"]);
		});
	});

	describe("without a registry on the bus", () => {
		it("still routes the outcome of its own handler", async () => {
			const bus = createBus<Events>();
			const handler = vi.fn();
			bus.on("loaded", handler);
			const job = createJob("user/load", async (id: string) => `user ${id}`, {
				done: "loaded",
			});
			await bus.emit(job, "1");

			expect(handler.mock.calls[0]?.[0]).toBe("user 1");
		});

		it("still routes the failure", async () => {
			const bus = createBus<Events>();
			const failed = vi.fn();
			bus.on("failed", failed);
			const job = createJob(
				"user/load",
				async () => {
					throw new Error("boom");
				},
				{ fail: "failed" },
			);

			await expect(bus.emit(job, void 0)).resolves.toBeUndefined();
			expect(failed).toHaveBeenCalledTimes(1);
		});
	});

	describe("abort", () => {
		it("sends no outlet once the task was aborted", async () => {
			const { bus } = setup();
			const loaded = vi.fn();
			bus.on("loaded", loaded);
			const job = createJob(
				"user/load",
				async (_: string, ctx) => {
					ctx.abort();
					return "x";
				},
				{ done: "loaded" },
			);

			await expect(bus.emit(job, "1")).resolves.toBe("x");
			expect(loaded).not.toHaveBeenCalled();
		});

		it("sends no error outlet once the task was aborted", async () => {
			const { bus } = setup();
			const failed = vi.fn();
			bus.on("failed", failed);
			const job = createJob(
				"user/load",
				async (_: string, ctx) => {
					ctx.abort();
					throw new Error("boom");
				},
				{ fail: "failed" },
			);

			await expect(bus.emit(job, "1")).resolves.toBeUndefined();
			expect(failed).not.toHaveBeenCalled();
		});
	});

	describe("direct call", () => {
		it("runs the handler and returns a promise, with no outlets", async () => {
			const loaded = vi.fn();
			const job = createJob("user/load", (id: string) => `user ${id}`, {
				done: "loaded",
			});
			const result = job("1");

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBe("user 1");
			expect(loaded).not.toHaveBeenCalled();
		});

		it("rejects when the handler fails", async () => {
			const job = createJob("user/load", async () => {
				throw new Error("boom");
			});

			await expect(job(void 0)).rejects.toThrow("boom");
		});

		it("throws when there is no handler", () => {
			const job = createJob<string, string>("user/load");

			expect(() => job("1")).toThrow("No handler");
		});
	});

	describe("trace", () => {
		it("reports the run as a command", async () => {
			const { bus, recorder } = setup();
			const job = createJob("user/load", async () => "x", { done: "loaded" });
			await bus.emit(job, void 0);

			expect(
				recorder.events.map((event) => `${event.effect}/${event.phase}`),
			).toEqual(["command/start", "command/done"]);
		});
	});
});
