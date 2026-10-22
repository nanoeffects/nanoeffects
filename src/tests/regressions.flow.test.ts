// Tricky cases taken from issues of other libraries, run against our effects and bus.
//
// redux-saga: #578, #598, #277, #413, #61, #283, #875
// effector:   #522
// RxJS:       #5487, #2459, #3183
// eventemitter3: #63; nanoevents: #51; mitt: #15, #123
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import type { Task } from "../core/types";
import { all, onAbort, race, take } from "../effects";
import { latest } from "../policies";
import { createHarness, deferred, type TestEvents } from "./test-helpers";

const latestTask = <P, R>(handler: Task<P, TestEvents, R>) => latest(handler);

describe("regressions: flows", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("redux-saga #578: race must cancel the loser when the winner is ready at once", () => {
		it("the listener of a losing take is removed, so the next round does not see a stale one", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const losers = vi.fn();
			const first = race(ctx, {
				ready: () => Promise.resolve("now"),
				later: ({ signal }) => take(ctx, "b", { signal }).catch(losers),
			});

			await expect(first).resolves.toEqual({ ready: "now" });
			await vi.advanceTimersByTimeAsync(0);
			// a second round: one emit must settle one take only
			const second = take(ctx, "b");
			harness.bus.emit("b", "x");

			await expect(second).resolves.toBe("x");
		});

		it("the loser has been aborted before the code after race continues", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			await race(harness.ctx(), {
				ready: () => "now",
				later: ({ signal }) => {
					signals.push(signal);
					return new Promise(() => {});
				},
			});

			expect(signals[0]?.aborted).toBe(true);
		});
	});

	describe("RxJS #5487, #2459: a finished source is torn down at once", () => {
		it("a take that wins stops listening before the next line runs", async () => {
			const harness = createHarness();
			const predicate = vi.fn(() => true);
			const promise = take(harness.ctx(), "b", { predicate });
			harness.bus.emit("b", "first");
			harness.bus.emit("b", "second");
			await promise;

			expect(predicate).toHaveBeenCalledTimes(1);
		});

		it("cleanup of a loser runs when the race is over, not when the parent ends", async () => {
			const harness = createHarness();
			const cleaned = vi.fn();
			await race(harness.ctx(), {
				ready: () => "now",
				later: ({ signal }) => {
					onAbort({ signal }, cleaned);
					return new Promise(() => {});
				},
			});

			expect(cleaned).toHaveBeenCalledTimes(1);
		});

		it("all: a failure tears down the siblings at once", async () => {
			const harness = createHarness();
			const cleaned = vi.fn();
			const failed = all(harness.ctx(), {
				bad: () => Promise.reject(new Error("boom")),
				slow: ({ signal }) => {
					onAbort({ signal }, cleaned);
					return new Promise(() => {});
				},
			});

			await expect(failed).rejects.toThrow("boom");
			expect(cleaned).toHaveBeenCalledTimes(1);
		});
	});

	describe("redux-saga #598: an event is missed if nobody listens at that moment", () => {
		it("take sees only events after the call, so listen before the work that emits", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			harness.bus.emit("b", "early");
			const late = take(ctx, "b");
			harness.bus.emit("b", "on time");

			await expect(late).resolves.toBe("on time");
		});

		it("a take registered before a synchronous emit by the same handler sees it", async () => {
			const harness = createHarness();
			const seen: string[] = [];
			harness.bus.on("t", async (_, ctx) => {
				const waiting = take(ctx, "b");
				ctx.emit("b", "sync");
				seen.push(await waiting);
			});
			harness.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(0);

			expect(seen).toEqual(["sync"]);
		});
	});

	describe("redux-saga #277: a child emits synchronously while it starts", () => {
		it("a listener of the parent receives the event the child emits in its first tick", async () => {
			const harness = createHarness();
			const received: string[] = [];
			harness.bus.on("t", async (_, ctx) => {
				ctx.on("b", (payload) => {
					received.push(payload);
				});
				await ctx.run((_, child) => {
					child.emit("b", "from child");
				});
			});
			harness.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(0);

			expect(received).toEqual(["from child"]);
		});
	});

	describe("redux-saga #413: siblings hear each other", () => {
		it("two tasks started from one event take what the other emits", async () => {
			const harness = createHarness();
			const heard: string[] = [];
			harness.bus.on("t", async (_, ctx) => {
				await all(ctx, [
					async () => {
						heard.push(await take(ctx, "b"));
					},
					() => {
						ctx.emit("b", "ping");
					},
				]);
			});
			harness.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(0);

			expect(heard).toEqual(["ping"]);
		});
	});

	describe("redux-saga #61: a catch-all listener must not feed itself", () => {
		it("with tracing on, a catch-all handler runs once per emit", () => {
			const harness = createHarness();
			const handler = vi.fn();
			harness.bus.on("*", handler);
			harness.bus.emit("t", 1);
			harness.bus.emit("b", "x");

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("redux-saga #283: rejected with nothing", () => {
		it.each([
			["undefined", void 0],
			["null", null],
			["0", 0],
			["empty string", ""],
		])(
			"a task that rejects with %s is a rejection with that value",
			async (_, reason) => {
				const harness = createHarness();

				await expect(
					harness.ctx().run(() => Promise.reject(reason)),
				).rejects.toBe(reason);
			},
		);

		it("race and all keep a falsy rejection too", async () => {
			const harness = createHarness();
			const settled = await Promise.allSettled([
				all(harness.ctx(), [() => Promise.reject(void 0)]),
				race(harness.ctx(), [() => Promise.reject(null)]),
			]);

			expect(settled.map((result) => result.status)).toEqual([
				"rejected",
				"rejected",
			]);
		});
	});

	describe("redux-saga #875: unsubscribing is safe after the end", () => {
		it("the unsubscribe function can be called many times, also after off()", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			const off = bus.on("t", handler);
			bus.off();

			expect(() => {
				off();
				off();
			}).not.toThrow();
			bus.emit("t", 1);
			expect(handler).not.toHaveBeenCalled();
		});

		it("a stale unsubscribe does not remove a listener that was added later (nanoevents #51)", () => {
			const bus = createBus<TestEvents>();
			const stale = bus.on("t", () => {});
			bus.off();
			const handler = vi.fn();
			bus.on("t", handler);
			stale();
			bus.emit("t", 1);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("task subscriptions are dropped once, also when abort is called twice", () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const handler = vi.fn();
			ctx.on("b", handler);
			ctx.abort();
			ctx.abort();
			harness.bus.emit("b", "x");

			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("effector #522: the state seen by a handler is the latest, not a stale copy", () => {
		it("a pending flag follows the last call when calls overlap under latest", async () => {
			const harness = createHarness();
			const gates = [deferred(), deferred()];
			let pending = 0;
			const states: number[] = [];
			const run = latestTask(async (index: number) => {
				pending += 1;
				states.push(pending);
				try {
					await gates[index]?.promise;
				} finally {
					pending -= 1;
				}
			});
			const first = run(0, harness.ctx());
			const second = run(1, harness.ctx());
			gates[0]?.resolve();
			gates[1]?.resolve();
			await Promise.allSettled([first, second]);

			expect(pending).toBe(0);
			expect(states).toEqual([1, 2]);
		});

		it("finally of a cancelled call still runs, so a counter does not leak", async () => {
			const harness = createHarness();
			const finished = vi.fn();
			const run = latestTask(async (_: number, ctx) => {
				try {
					await new Promise((_, reject) =>
						ctx.signal.addEventListener("abort", () =>
							reject(ctx.signal.reason),
						),
					);
				} finally {
					finished();
				}
			});
			const first = run(1, harness.ctx());
			run(2, harness.ctx());
			await Promise.allSettled([first]);

			expect(finished).toHaveBeenCalledTimes(1);
		});
	});

	describe("RxJS #3183: an error in one branch is not swallowed by a switch", () => {
		it("an error thrown by the newest call under latest reaches the caller", async () => {
			const harness = createHarness();
			const run = latestTask(async (value: number) => {
				if (value === 2) {
					throw new Error("newest failed");
				}
				return value;
			});
			run(1, harness.ctx());

			await expect(run(2, harness.ctx())).rejects.toThrow("newest failed");
		});
	});

	describe("mitt #15: one handler throws", () => {
		it("without onError the error is thrown and the rest do not run", () => {
			const bus = createBus<TestEvents>();
			const after = vi.fn();
			bus.on("t", () => {
				throw new Error("oops");
			});
			bus.on("t", after);

			expect(() => bus.emit("t", 1)).toThrow("oops");
			expect(after).not.toHaveBeenCalled();
		});

		it("with onError every handler runs and the error is reported", () => {
			const onError = vi.fn();
			const bus = createBus<TestEvents>({ onError });
			const after = vi.fn();
			bus.on("t", () => {
				throw new Error("oops");
			});
			bus.on("t", after);
			bus.emit("t", 1);

			expect(after).toHaveBeenCalledTimes(1);
			expect(onError).toHaveBeenCalledTimes(1);
		});
	});

	describe("mitt #123, eventemitter3 #63: off removes what it is asked to", () => {
		it("off(event) removes every listener of that event only", () => {
			const bus = createBus<TestEvents>();
			const first = vi.fn();
			const other = vi.fn();
			bus.on("t", first);
			bus.on("t", first);
			bus.on("b", other);
			bus.off("t");
			bus.emit("t", 1);
			bus.emit("b", "x");

			expect(first).not.toHaveBeenCalled();
			expect(other).toHaveBeenCalledTimes(1);
		});

		it("off(event, fn) with a listener added twice leaves one (eventemitter3 #63)", () => {
			const bus = createBus<TestEvents>();
			const handler = vi.fn();
			bus.on("t", handler);
			bus.on("t", handler);
			bus.off("t", handler);
			bus.emit("t", 1);

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});
});
