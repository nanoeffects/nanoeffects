import { describe, expect, it, vi } from "vitest";
import { latest } from "../policies";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { anyEventType, createBus } from "./bus";

describe("bus", () => {
	describe("emit and on", () => {
		it("calls the handler of the event key with the payload", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			bus.on("t", handler);
			bus.emit("t", 5);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe(5);
		});

		it("does not call handlers of other events", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			bus.on("b", handler);
			bus.emit("t", 5);

			expect(handler).not.toHaveBeenCalled();
		});

		it("accepts an object event", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			bus.on("t", handler);
			bus.emit({ type: "t", payload: 7 });

			expect(handler.mock.calls[0]?.[0]).toBe(7);
		});

		it("accepts an object event as the subscription key", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			bus.on({ type: "t" }, handler);
			bus.emit("t", 1);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("calls a handler function and returns its result", () => {
			const bus = createBus<TestEvents>();
			const listener = vi.fn();
			bus.on("t", listener);
			const handler = Object.assign((value: number) => value * 2, {
				type: "t" as const,
			});

			expect(bus.emit(handler, 4)).toBe(8);
			expect(listener.mock.calls[0]?.[0]).toBe(4);
		});

		it("does nothing without handlers", () => {
			const bus = createBus<TestEvents>();

			expect(() => bus.emit("t", 1)).not.toThrow();
		});

		it("calls handlers in subscription order", () => {
			const bus = createBus<TestEvents>();
			const calls: string[] = [];
			bus.on("t", () => calls.push("first"));
			bus.on("t", () => calls.push("second"));
			bus.emit("t", 1);

			expect(calls).toEqual(["first", "second"]);
		});

		it("calls the same handler twice if it is subscribed twice", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			bus.on("t", handler);
			bus.on("t", handler);
			bus.emit("t", 1);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("calls any-event handlers after the handlers of the key", () => {
			const bus = createBus<TestEvents>();
			const calls: string[] = [];
			bus.on(anyEventType, () => calls.push("any"));
			bus.on("t", () => calls.push("key"));
			bus.emit("t", 1);

			expect(calls).toEqual(["key", "any"]);
		});

		it("any-event handlers receive every event", () => {
			const bus = createBus<TestEvents>();
			const seen: unknown[] = [];
			bus.on(anyEventType, (payload) => seen.push(payload));
			bus.emit("t", 1);
			bus.emit("b", "x");

			expect(seen).toEqual([1, "x"]);
		});

		it("a handler subscribed during emit is not called by that emit", () => {
			const bus = createBus<TestEvents>();
			const late = vi.fn();
			bus.on("t", () => {
				bus.on("t", late);
			});
			bus.emit("t", 1);

			expect(late).not.toHaveBeenCalled();
			bus.emit("t", 2);
			expect(late).toHaveBeenCalledTimes(1);
		});

		it("a handler unsubscribed during emit is still called by that emit", () => {
			const bus = createBus<TestEvents>();
			const second = vi.fn();
			let offSecond = () => {};
			bus.on("t", () => offSecond());
			offSecond = bus.on("t", second);
			bus.emit("t", 1);

			expect(second).toHaveBeenCalledTimes(1);
			bus.emit("t", 2);
			expect(second).toHaveBeenCalledTimes(1);
		});
	});

	describe("off", () => {
		it("on returns an unsubscribe callback", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			const off = bus.on("t", handler);
			off();
			bus.emit("t", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("off(event, fn) removes only that handler", () => {
			const bus = createBus<TestEvents>();
			const kept = vi.fn();
			const removed = vi.fn();
			bus.on("t", kept);
			bus.on("t", removed);
			bus.off("t", removed);
			bus.emit("t", 1);

			expect(kept).toHaveBeenCalledTimes(1);
			expect(removed).not.toHaveBeenCalled();
		});

		it("off(event) removes every handler of the event", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			bus.on("t", handler);
			bus.on("t", handler);
			bus.off("t");
			bus.emit("t", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("off accepts an object event", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			bus.on("t", handler);
			bus.off({ type: "t" }, handler);
			bus.emit("t", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("unsubscribing twice is harmless", () => {
			const bus = createBus<TestEvents>();
			const off = bus.on("t", () => {});

			expect(() => {
				off();
				off();
			}).not.toThrow();
		});
	});

	describe("task context", () => {
		it("carries the event type and payload", () => {
			const bus = createBus<TestEvents>();
			const seen: unknown[] = [];
			bus.on("t", (_, ctx) => seen.push([ctx.type, ctx.payload]));
			bus.emit("t", 3);

			expect(seen).toEqual([["t", 3]]);
		});

		it("starts with a live signal", () => {
			const { ctx } = createHarness();

			expect(ctx().signal.aborted).toBe(false);
		});

		it("gives every handler its own task", () => {
			const bus = createBus<TestEvents>();
			const contexts: object[] = [];
			const signals: AbortSignal[] = [];
			const save = (_: number, ctx: { signal: AbortSignal }) => {
				contexts.push(ctx);
				signals.push(ctx.signal);
			};
			bus.on("t", save);
			bus.on("t", save);
			bus.emit("t", 1);

			expect(contexts[0]).not.toBe(contexts[1]);
			expect(signals[0]).not.toBe(signals[1]);
		});

		it("gives every emit its own task", () => {
			const harness = createHarness();

			expect(harness.ctx().signal).not.toBe(harness.ctx().signal);
		});

		it("abort aborts only this task", () => {
			const harness = createHarness();
			const first = harness.ctx();
			const second = harness.ctx();
			first.abort("stop");

			expect(first.signal.aborted).toBe(true);
			expect(first.signal.reason).toBe("stop");
			expect(second.signal.aborted).toBe(false);
		});

		it("abort without a reason aborts too", () => {
			const ctx = createHarness().ctx();
			ctx.abort();

			expect(ctx.signal.aborted).toBe(true);
		});

		it("emit forwards to the bus while the task is alive", () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("b", handler);
			harness.ctx().emit("b", "hi");

			expect(handler.mock.calls[0]?.[0]).toBe("hi");
		});

		it("emit supports object events", () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("b", handler);
			harness.ctx().emit({ type: "b", payload: "hi" });

			expect(handler.mock.calls[0]?.[0]).toBe("hi");
		});

		it("emit is a no-op after the task is aborted", () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("b", handler);
			const ctx = harness.ctx();
			ctx.abort();
			ctx.emit("b", "hi");

			expect(handler).not.toHaveBeenCalled();
		});

		it("emit from a handler reaches handlers of other events", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			bus.on("b", handler);
			bus.on("t", (value, ctx) => {
				ctx.emit("b", `got ${value}`);
			});
			bus.emit("t", 1);

			expect(handler.mock.calls[0]?.[0]).toBe("got 1");
		});
	});

	describe("ctx.run", () => {
		it("runs a child task with the payload and returns its result", async () => {
			const ctx = createHarness().ctx();
			const result = await ctx.run((value: number) => value + 1, 5);

			expect(result).toBe(6);
		});

		it("awaits an async child", async () => {
			const ctx = createHarness().ctx();
			const gate = deferred<string>();
			const promise = ctx.run(() => gate.promise);
			gate.resolve("done");

			await expect(promise).resolves.toBe("done");
		});

		it("gives the child its own signal that follows the parent", async () => {
			const ctx = createHarness().ctx();
			const signals: AbortSignal[] = [];
			await ctx.run((_: number, child) => {
				signals.push(child.signal);
			}, 1);
			const [child] = signals;

			expect(child).not.toBe(ctx.signal);
			expect(child?.aborted).toBe(false);
		});

		it("aborts a running child when the parent aborts", async () => {
			const ctx = createHarness().ctx();
			const gate = deferred();
			const childSignals: AbortSignal[] = [];
			const promise = ctx.run((_: number, child) => {
				childSignals.push(child.signal);
				return gate.promise;
			}, 1);
			ctx.abort("stop");

			expect(childSignals[0]?.aborted).toBe(true);
			expect(childSignals[0]?.reason).toBe("stop");
			gate.resolve();
			await promise;
		});

		it("aborting the child does not abort the parent", async () => {
			const ctx = createHarness().ctx();
			await ctx.run((_: number, child) => {
				child.abort();
			}, 1);

			expect(ctx.signal.aborted).toBe(false);
		});

		it("rejects with the abort reason if the parent is already aborted", async () => {
			const ctx = createHarness().ctx();
			ctx.abort("stop");
			const handler = vi.fn();

			await expect(ctx.run(handler)).rejects.toBe("stop");
			expect(handler).not.toHaveBeenCalled();
		});

		it("propagates a child error to the caller", async () => {
			const ctx = createHarness().ctx();

			await expect(
				ctx.run(() => {
					throw new Error("boom");
				}),
			).rejects.toThrow("boom");
		});

		it("propagates an async child error", async () => {
			const ctx = createHarness().ctx();

			await expect(
				ctx.run(() => Promise.reject(new Error("boom"))),
			).rejects.toThrow("boom");
		});

		it("cascades an abort through nested children", async () => {
			const ctx = createHarness().ctx();
			const gate = deferred();
			const signals: AbortSignal[] = [];
			const promise = ctx.run((_: number, first) => {
				signals.push(first.signal);
				return first.run((_: number, second) => {
					signals.push(second.signal);
					return second.run((_: number, ctx) => {
						signals.push(ctx.signal);
						return gate.promise;
					}, 1);
				}, 1);
			}, 1);
			ctx.abort();

			expect(signals).toHaveLength(3);
			expect(signals.every((signal) => signal.aborted)).toBe(true);
			gate.resolve();
			await promise;
		});

		it("a child emit is a no-op once the child is aborted", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("b", handler);
			const ctx = harness.ctx();
			await ctx.run((_: number, child) => {
				child.abort();
				child.emit("b", "x");
			}, 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("detaches the child from the parent when it finishes", async () => {
			const ctx = createHarness().ctx();
			const signals: AbortSignal[] = [];
			await ctx.run((_: number, child) => {
				signals.push(child.signal);
			}, 1);
			ctx.abort();

			expect(signals[0]?.aborted).toBe(false);
		});
	});

	describe("handler errors", () => {
		it("without onError the first error stops the remaining handlers and reaches the emitter", () => {
			const bus = createBus<TestEvents>();
			const before = vi.fn();
			const after = vi.fn();
			const any = vi.fn();
			bus.on("t", before);
			bus.on("t", () => {
				throw new Error("boom");
			});
			bus.on("t", after);
			bus.on(anyEventType, any);

			expect(() => bus.emit("t", 1)).toThrow("boom");
			expect(before).toHaveBeenCalledTimes(1);
			expect(after).not.toHaveBeenCalled();
			expect(any).not.toHaveBeenCalled();
		});

		it("without onError the thrown value is the original error", () => {
			const bus = createBus<TestEvents>();
			const error = new Error("boom");
			bus.on("t", () => {
				throw error;
			});

			try {
				bus.emit("t", 1);
				expect.unreachable();
			} catch (caught) {
				expect(caught).toBe(error);
			}
		});

		it("without onError a failed emit does not call the handler function", () => {
			const bus = createBus<TestEvents>();
			bus.on("t", () => {
				throw new Error("boom");
			});
			const handler = vi.fn((value: number) => value);
			const withType = Object.assign(handler, { type: "t" as const });

			expect(() => bus.emit(withType, 1)).toThrow("boom");
			expect(handler).not.toHaveBeenCalled();
		});

		it("a handler that threw stays subscribed", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn(() => {
				throw new Error("boom");
			});
			bus.on("t", handler);

			expect(() => bus.emit("t", 1)).toThrow();
			expect(() => bus.emit("t", 2)).toThrow();
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("does not throw when nothing fails", () => {
			const bus = createBus<TestEvents>({ onError: vi.fn() });
			bus.on("t", () => {});

			expect(() => bus.emit("t", 1)).not.toThrow();
		});

		describe("with onError", () => {
			it("reports a thrown error with the event instead of throwing", () => {
				const onError = vi.fn();
				const bus = createBus<TestEvents>({ onError });
				const error = new Error("boom");
				const after = vi.fn();
				bus.on("t", () => {
					throw error;
				});
				bus.on("t", after);

				expect(() => bus.emit("t", 4)).not.toThrow();
				expect(onError).toHaveBeenCalledWith(error, { type: "t", payload: 4 });
				expect(after).toHaveBeenCalledTimes(1);
			});

			it("reports every failing handler separately", () => {
				const onError = vi.fn();
				const bus = createBus<TestEvents>({ onError });
				bus.on("t", () => {
					throw new Error("one");
				});
				bus.on("t", () => {
					throw new Error("two");
				});
				bus.emit("t", 1);

				expect(onError).toHaveBeenCalledTimes(2);
			});

			it("reports a rejection of an async handler", async () => {
				const onError = vi.fn();
				const bus = createBus<TestEvents>({ onError });
				const error = new Error("late");
				bus.on("t", async () => {
					throw error;
				});
				bus.emit("t", 2);
				await Promise.resolve();
				await Promise.resolve();

				expect(onError).toHaveBeenCalledWith(error, { type: "t", payload: 2 });
			});

			it("does not report an async handler that resolves", async () => {
				const onError = vi.fn();
				const bus = createBus<TestEvents>({ onError });
				bus.on("t", async () => {});
				bus.emit("t", 1);
				await Promise.resolve();
				await Promise.resolve();

				expect(onError).not.toHaveBeenCalled();
			});

			it("reports a rejection that comes from a policy-wrapped handler", async () => {
				const onError = vi.fn();
				const bus = createBus<TestEvents>({ onError });
				bus.on(
					"t",
					latest<number, TestEvents, Promise<void>>(async () => {
						throw new Error("wrapped");
					}),
				);
				bus.emit("t", 1);
				await new Promise((result) => setTimeout(result, 0));

				expect(onError).toHaveBeenCalledTimes(1);
			});

			it("keeps going when onError itself throws, and logs it", () => {
				const log = vi.spyOn(console, "error").mockImplementation(() => {});
				const bus = createBus<TestEvents>({
					onError: () => {
						throw new Error("onError failed");
					},
				});
				const after = vi.fn();
				bus.on("t", () => {
					throw new Error("boom");
				});
				bus.on("t", after);

				expect(() => bus.emit("t", 1)).not.toThrow();
				expect(after).toHaveBeenCalledTimes(1);
				expect(log).toHaveBeenCalledTimes(1);
				log.mockRestore();
			});

			it("logs a throwing onError for an async rejection too, without an unhandled rejection", async () => {
				const log = vi.spyOn(console, "error").mockImplementation(() => {});
				const bus = createBus<TestEvents>({
					onError: () => {
						throw new Error("onError failed");
					},
				});
				bus.on("t", async () => {
					throw new Error("late");
				});
				bus.emit("t", 1);
				await new Promise((result) => setTimeout(result, 0));

				expect(log).toHaveBeenCalledTimes(1);
				log.mockRestore();
			});

			it("still returns the result of a handler function", () => {
				const bus = createBus<TestEvents>({ onError: vi.fn() });
				const handler = Object.assign((value: number) => value * 2, {
					type: "t" as const,
				});

				expect(bus.emit(handler, 4)).toBe(8);
			});
		});
	});

	describe("ctx.on and ctx.off", () => {
		it("subscribes like bus.on", () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.ctx().on("b", handler);
			harness.bus.emit("b", "hi");

			expect(handler.mock.calls[0]?.[0]).toBe("hi");
		});

		it("returns an unsubscribe callback", () => {
			const harness = createHarness();
			const handler = vi.fn();
			const off = harness.ctx().on("b", handler);
			off();
			harness.bus.emit("b", "hi");

			expect(handler).not.toHaveBeenCalled();
		});

		it("unsubscribing twice, or after an abort, is harmless", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const off = ctx.on("b", () => {});
			ctx.abort();

			expect(() => {
				off();
				off();
			}).not.toThrow();
		});

		it("removes the subscription when the task aborts", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn();
			ctx.on("b", handler);
			harness.bus.emit("b", "one");
			ctx.abort();
			harness.bus.emit("b", "two");

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("keeps the subscription of a task that is not aborted", () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.ctx().on("b", handler);
			harness.bus.emit("b", "one");
			harness.bus.emit("b", "two");

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("does nothing after the task is aborted", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			ctx.abort();
			const handler = vi.fn();
			const off = ctx.on("b", handler);
			harness.bus.emit("b", "hi");

			expect(handler).not.toHaveBeenCalled();
			expect(() => off()).not.toThrow();
		});

		it("an abort of another task keeps this subscription", () => {
			const harness = createHarness();
			const first = harness.ctx();
			const second = harness.ctx();
			const handler = vi.fn();
			first.on("b", handler);
			second.abort();
			harness.bus.emit("b", "hi");

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("supports the any-event key", () => {
			const harness = createHarness();
			const seen: unknown[] = [];
			harness.ctx().on(anyEventType, (payload) => seen.push(payload));
			harness.bus.emit("t", 1);
			harness.bus.emit("b", "x");

			expect(seen).toEqual([1, "x"]);
		});

		it("gives the handler a task context of its own", () => {
			const harness = createHarness();
			const subscriber = harness.ctx();
			const seen: object[] = [];
			subscriber.on("b", (_, ctx) => {
				seen.push(ctx);
			});
			harness.bus.emit("b", "hi");

			expect(seen[0]).not.toBe(subscriber);
		});

		it("off removes a handler subscribed through ctx.on", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn();
			ctx.on("b", handler);
			ctx.off("b", handler);
			harness.bus.emit("b", "hi");

			expect(handler).not.toHaveBeenCalled();
		});

		it("off(event) clears every handler of the event, like the bus", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn();
			harness.bus.on("b", handler);
			ctx.off("b");
			harness.bus.emit("b", "hi");

			expect(handler).not.toHaveBeenCalled();
		});

		it("a child task's subscription ends with the child, not the parent", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn();
			await ctx.run((_: number, child) => {
				child.on("b", handler);
				child.abort();
			}, 1);
			harness.bus.emit("b", "hi");

			expect(handler).not.toHaveBeenCalled();
			expect(ctx.signal.aborted).toBe(false);
		});

		it("a child task's subscription ends when the parent aborts", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn();
			const gate = deferred();
			const promise = ctx.run((_: number, child) => {
				child.on("b", handler);
				return gate.promise;
			}, 1);
			ctx.abort();
			harness.bus.emit("b", "hi");

			expect(handler).not.toHaveBeenCalled();
			gate.resolve();
			await promise;
		});

		it("a policy fork's subscription ends when its run is superseded", () => {
			const harness = createHarness();
			const seen: string[] = [];
			const handler = latest<number, TestEvents, Promise<void>>(
				async (value, ctx) => {
					ctx.on("b", () => {
						seen.push(`run ${value}`);
					});
					await new Promise(() => {});
				},
			);
			handler(1, harness.ctx());
			handler(2, harness.ctx());
			harness.bus.emit("b", "hi");

			expect(seen).toEqual(["run 2"]);
		});
	});
});
