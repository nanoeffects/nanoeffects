// Tricky cases taken from issues of other libraries, run against our effects.
//
// p-queue:    #29, #23, #110, #87
// bottleneck: #134, #95, #63
// p-retry:    #25, #14, #78, #58, #36, #34
// cockatiel:  #30 (backoff)
// coder/mux:  #548 (backoff)
// p-retry (signal listeners, hooks that throw), axios-retry (delay from the error),
// cockatiel (timers while waiting): classes of defects, not single issues
// RxJS:       #674, #5653
// timers:     setTimeout limits (a wait over 2^31 - 1 ms fires at once)
// emitters:   mitt, emittery, nanoevents
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModule } from "../actions";
import { createBus } from "../core/bus";
import type { Task } from "../core/types";
import { backoff, delay, poll, retry, timeout } from "../effects";
import { debounce, queue, throttle } from "../policies";
import {
	createApp,
	createHarness,
	deferred,
	type TestEvents,
} from "./test-helpers";

const queueTask = <P, R>(
	handler: Task<P, TestEvents, R>,
	options?: Parameters<typeof queue>[1],
) => queue(handler, options);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("regressions: queues", () => {
	describe("p-queue #29: one rejected task", () => {
		it("rejects only that call, the others resolve", async () => {
			const harness = createHarness();
			const queued = queueTask(async (value: number) => {
				if (value === 2) {
					throw new Error("boom");
				}
				return value;
			});
			const results = await Promise.allSettled(
				[1, 2, 3].map((value) => queued(value, harness.ctx())),
			);

			expect(results.map((result) => result.status)).toEqual([
				"fulfilled",
				"rejected",
				"fulfilled",
			]);
		});

		it("the queue is idle afterwards and starts the next call at once", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => {
				if (value === 1) {
					throw new Error("boom");
				}
				return value;
			});
			const queued = queueTask(handler);
			await queued(1, harness.ctx()).catch(() => {});
			queued(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("a failing call does not produce an unhandled rejection when the caller handles it", async () => {
			const harness = createHarness();
			const queued = queueTask(async () => {
				throw new Error("boom");
			});
			await queued(1, harness.ctx()).catch(() => {});
			await flush();
		});
	});

	describe("p-queue #23: the queue is cleared while something runs", () => {
		it("after every waiting and running call is aborted, a new call runs at once", () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise(() => {}));
			const queued = queueTask(handler);
			const ctxs = [harness.ctx(), harness.ctx(), harness.ctx(), harness.ctx()];
			for (const ctx of ctxs) {
				queued(1, ctx);
			}
			expect(handler).toHaveBeenCalledTimes(1);
			// the waiting calls first: aborting the running one frees a slot for the next
			for (const ctx of ctxs.reverse()) {
				ctx.abort("clear");
			}
			queued(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("the calls that were waiting resolve with undefined", async () => {
			const harness = createHarness();
			const queued = queueTask(() => new Promise(() => {}));
			const first = harness.ctx();
			const second = harness.ctx();
			queued(1, first);
			const waiting = queued(2, second);
			first.abort();
			second.abort();

			await expect(waiting).resolves.toBeUndefined();
		});
	});

	describe("p-queue #110, bottleneck #134: a task that never ends holds a slot", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("without a timeout one hanging call blocks the queue", async () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise(() => {}));
			const queued = queueTask(handler);
			queued(1, harness.ctx());
			queued(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(60_000);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("with a timeout around the task the slot comes back", async () => {
			const harness = createHarness();
			const started: number[] = [];
			const queued = queueTask((value: number, ctx) =>
				timeout(ctx, 100, () => {
					started.push(value);
					return new Promise(() => {});
				}),
			);
			const first = queued(1, harness.ctx()).catch(() => "timed out");
			queued(2, harness.ctx()).catch(() => {});
			await vi.advanceTimersByTimeAsync(100);
			await first;
			await vi.advanceTimersByTimeAsync(100);

			expect(started).toEqual([1, 2]);
		});

		it("the slot comes back for every hanging call in turn", async () => {
			const harness = createHarness();
			const started: number[] = [];
			const queued = queueTask((value: number, ctx) =>
				timeout(ctx, 50, () => {
					started.push(value);
					return new Promise(() => {});
				}),
			);
			for (let index = 1; index <= 5; index++) {
				queued(index, harness.ctx()).catch(() => {});
			}
			await vi.advanceTimersByTimeAsync(400);

			expect(started).toEqual([1, 2, 3, 4, 5]);
		});
	});

	describe("bottleneck #134: slots that stay 'running'", () => {
		it("a task that throws something that is not an Error frees its slot", async () => {
			const harness = createHarness();
			const values = [void 0, null, 0, "", false, { reason: "x" }];
			let index = 0;
			const queued = queueTask(async () => {
				throw values[index++ % values.length];
			});
			const results = await Promise.allSettled(
				values.map(() => queued(0, harness.ctx())),
			);

			expect(results.every((result) => result.status === "rejected")).toBe(
				true,
			);
			expect(index).toBe(values.length);
		});

		it("after thousands of mixed outcomes the queue is idle and starts a new call at once", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => {
				if (value % 7 === 0) {
					throw new Error("boom");
				}
				if (value % 11 === 0) {
					throw null;
				}
				return value;
			});
			const queued = queueTask(handler, { concurrency: 3 });
			await Promise.allSettled(
				Array.from({ length: 3000 }, (_, value) =>
					queued(value + 1, harness.ctx()),
				),
			);
			const before = handler.mock.calls.length;
			queued(1, harness.ctx());

			expect(handler.mock.calls.length).toBe(before + 1);
		});

		it("never runs more than the limit at the same time over many calls", async () => {
			const harness = createHarness();
			let running = 0;
			let max = 0;
			const queued = queueTask(
				async (value: number) => {
					running++;
					max = Math.max(max, running);
					await Promise.resolve();
					running--;
					if (value % 5 === 0) {
						throw new Error("boom");
					}
				},
				{ concurrency: 4 },
			);
			await Promise.allSettled(
				Array.from({ length: 2000 }, (_, value) =>
					queued(value, harness.ctx()),
				),
			);

			expect(max).toBe(4);
		});
	});

	describe("p-queue #87: backpressure", () => {
		it("a limit keeps the line short however many calls come", async () => {
			const harness = createHarness();
			const gate = deferred();
			const handler = vi.fn(() => gate.promise);
			const queued = queueTask(handler, { limit: 10 });
			const calls: Array<Promise<unknown>> = [];
			for (let index = 0; index < 100_000; index++) {
				calls.push(queued(index, harness.ctx()));
			}
			gate.resolve();
			await Promise.all(calls);

			expect(handler).toHaveBeenCalledTimes(11);
		});

		it("with drop-old the latest calls are the ones that run", async () => {
			const harness = createHarness();
			const gate = deferred();
			const started: number[] = [];
			const queued = queueTask(
				(value: number) => {
					started.push(value);
					return gate.promise;
				},
				{ limit: 3, overflow: "drop-old" },
			);
			const calls: Array<Promise<unknown>> = [];
			for (let index = 0; index < 1000; index++) {
				calls.push(queued(index, harness.ctx()));
			}
			gate.resolve();
			await Promise.all(calls);

			expect(started).toEqual([0, 997, 998, 999]);
		});
	});

	describe("bottleneck #95: a very long line", () => {
		it("runs 50 thousand waiting calls in order", async () => {
			const harness = createHarness();
			const order: number[] = [];
			const queued = queueTask((value: number) => {
				order.push(value);
			});
			const calls: Array<Promise<unknown>> = [];
			for (let index = 0; index < 50_000; index++) {
				calls.push(queued(index, harness.ctx()));
			}
			await Promise.all(calls);

			expect(order).toHaveLength(50_000);
			expect(order.slice(0, 3)).toEqual([0, 1, 2]);
			expect(order.at(-1)).toBe(49_999);
		});
	});

	describe("bottleneck #63: a safe shutdown", () => {
		it("disposing the app drops the waiting calls and runs nothing more", async () => {
			const handler = vi.fn(() => new Promise(() => {}));
			const app = createApp<TestEvents>();
			let results: Array<Promise<unknown>> = [];
			app.mount(
				createModule<TestEvents>("worker", (moduleContext) => {
					const queued = queue<number, TestEvents, unknown>(handler);
					results = [1, 2, 3, 4].map((value) => queued(value, moduleContext));
				}),
			);
			expect(handler).toHaveBeenCalledTimes(1);
			app.dispose();

			await expect(Promise.all(results.slice(1))).resolves.toEqual([
				void 0,
				void 0,
				void 0,
			]);
			expect(handler).toHaveBeenCalledTimes(1);
		});
	});
});

describe("regressions: retries", () => {
	describe("RxJS #674: how many attempts", () => {
		it("times is the number of calls, the first one included", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			await retry({}, handler, { times: 3 }).catch(() => {});

			expect(handler).toHaveBeenCalledTimes(3);
		});

		it("with times 1 the call is not repeated", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			await retry({}, handler, { times: 1 }).catch(() => {});

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("RxJS #5653: many synchronous attempts", () => {
		it("fifty thousand attempts do not overflow the stack", async () => {
			let calls = 0;
			await retry(
				{},
				() => {
					calls++;
					throw new Error("always");
				},
				{ times: 50_000 },
			).catch(() => {});

			expect(calls).toBe(50_000);
		});

		it("an async source that fails very many times does not either", async () => {
			let calls = 0;
			const result = await retry(
				{},
				async () => {
					calls++;
					if (calls < 20_000) {
						throw new Error("again");
					}
					return calls;
				},
				{ times: Number.POSITIVE_INFINITY },
			);

			expect(result).toBe(20_000);
		});
	});

	describe("p-retry #58: infinite retries", () => {
		it("times: Infinity keeps going until the call succeeds", async () => {
			let calls = 0;
			const result = await retry(
				{},
				() => {
					calls++;
					if (calls < 500) {
						throw new Error("again");
					}
					return "ok";
				},
				{ times: Number.POSITIVE_INFINITY },
			);

			expect(result).toBe("ok");
			expect(calls).toBe(500);
		});

		it("times: Infinity stops when the task aborts", async () => {
			const controller = new AbortController();
			let calls = 0;
			const result = retry(
				controller,
				async () => {
					calls++;
					if (calls === 100) {
						controller.abort("enough");
					}
					throw new Error("again");
				},
				{ times: Number.POSITIVE_INFINITY },
			);

			await expect(result).rejects.toBe("enough");
			expect(calls).toBe(100);
		});
	});

	describe("p-retry #25: what is thrown is not always an Error", () => {
		const thrown = [
			["a frozen error", Object.freeze(new Error("frozen"))],
			["a non-extensible error", Object.preventExtensions(new Error("fixed"))],
			["null", null],
			["undefined", void 0],
			["a string", "oops"],
			["a number", 42],
			["a plain object", { code: "E_X" }],
			["a sealed object", Object.seal({ code: "E_Y" })],
		] as const;

		it.each(thrown)("%s is retried and rethrown as it is", async (_, value) => {
			let calls = 0;
			let caught: unknown = "nothing";
			await retry(
				{},
				() => {
					calls++;
					throw value;
				},
				{ times: 3 },
			).catch((error: unknown) => {
				caught = error;
			});

			expect(calls).toBe(3);
			expect(caught).toBe(value);
		});

		it.each(thrown)(
			"%s reaches shouldRetry and the delay function",
			async (_, value) => {
				const seen: unknown[] = [];
				await retry(
					{},
					() => {
						throw value;
					},
					{
						times: 2,
						shouldRetry: (error) => {
							seen.push(error);
							return true;
						},
						delay: (_attempt, error) => {
							seen.push(error);
							return 0;
						},
					},
				).catch(() => {});

				expect(seen).toEqual([value, value]);
			},
		);

		it("a rejected promise made earlier is retried too", async () => {
			const error = new Error("boom");
			const failed = Promise.reject(error);
			failed.catch(() => {});
			const result = retry({}, () => failed, { times: 2 });

			await expect(result).rejects.toBe(error);
		});
	});

	describe("p-retry #14, #78: the error is left alone", () => {
		it("the error object is not changed", async () => {
			const error = new Error("boom");
			const keys = Reflect.ownKeys(error);
			const stack = error.stack;
			await retry(
				{},
				() => {
					throw error;
				},
				{ times: 3 },
			).catch(() => {});

			expect(Reflect.ownKeys(error)).toEqual(keys);
			expect(error.stack).toBe(stack);
		});

		it("the last error is the very object that was thrown", async () => {
			const errors = [new Error("one"), new Error("two"), new Error("three")];
			let calls = 0;
			const result = retry(
				{},
				() => {
					throw errors[calls++];
				},
				{ times: 3 },
			);

			await expect(result).rejects.toBe(errors[2]);
		});
	});

	describe("p-retry #36: empty options", () => {
		it("undefined options fall back to the defaults", async () => {
			const handler = vi.fn(() => {
				throw new Error("boom");
			});
			const options = { times: void 0, delay: void 0, shouldRetry: void 0 };
			await retry({}, handler, options as never).catch(() => {});

			expect(handler).toHaveBeenCalledTimes(3);
		});

		it("null options fall back to the defaults too, as plain JavaScript callers may pass them", async () => {
			const handler = vi.fn(() => {
				throw new Error("boom");
			});
			const options = { times: null, delay: null, shouldRetry: null };
			await retry({}, handler, options as never).catch(() => {});

			expect(handler).toHaveBeenCalledTimes(3);
		});

		it("a missing options argument works", async () => {
			const handler = vi.fn(() => {
				throw new Error("boom");
			});
			await retry({}, handler).catch(() => {});

			expect(handler).toHaveBeenCalledTimes(3);
		});
	});

	describe("p-retry #34: nested retries", () => {
		it("the attempts multiply", async () => {
			let calls = 0;
			await retry(
				{},
				() =>
					retry(
						{},
						() => {
							calls++;
							throw new Error("boom");
						},
						{ times: 3 },
					),
				{ times: 4 },
			).catch(() => {});

			expect(calls).toBe(12);
		});

		it("an abort stops both levels", async () => {
			const controller = new AbortController();
			let calls = 0;
			const result = retry(
				controller,
				() =>
					retry(
						controller,
						async () => {
							calls++;
							controller.abort("stop");
							throw new Error("boom");
						},
						{ times: 5 },
					),
				{ times: 5 },
			);

			await expect(result).rejects.toBe("stop");
			expect(calls).toBe(1);
		});
	});
});

describe("regressions: backoff", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("cockatiel #30: the first delay is zero", () => {
		it("the first pause is the base, not 0", () => {
			expect(backoff({ base: 100 })(1)).toBe(100);
		});

		it("retry waits the base before the second attempt", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			retry({}, handler, { times: 2, delay: backoff({ base: 100 }) }).catch(
				() => {},
			);

			await vi.advanceTimersByTimeAsync(99);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("coder/mux #548: the counter is not reset too early or kept too long", () => {
		it("a second retry call starts from the base again", async () => {
			const delays: number[] = [];
			const delay = backoff({ base: 100 });
			const recording = (attempt: number) => {
				const pause = delay(attempt);
				delays.push(pause);
				return pause;
			};
			const failing = () => {
				throw new Error("ERR");
			};

			for (let run = 0; run < 2; run++) {
				const result = retry({}, failing, { times: 3, delay: recording });
				result.catch(() => {});
				await vi.advanceTimersByTimeAsync(300);
			}

			expect(delays).toEqual([100, 200, 100, 200]);
		});

		it("one backoff function serves two retries at once", async () => {
			const delay = backoff({ base: 100 });
			const first = vi.fn(() => {
				throw new Error("A");
			});
			const second = vi.fn(() => {
				throw new Error("B");
			});
			retry({}, first, { times: 2, delay }).catch(() => {});
			await vi.advanceTimersByTimeAsync(50);
			retry({}, second, { times: 2, delay }).catch(() => {});

			await vi.advanceTimersByTimeAsync(50);
			expect(first).toHaveBeenCalledTimes(2);
			expect(second).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(50);
			expect(second).toHaveBeenCalledTimes(2);
		});
	});

	describe("RxJS retry({ delay }): a success must not leave a long pause behind", () => {
		it("a call that succeeds after a failure does not slow the next call", async () => {
			const delay = backoff({ base: 100 });
			let calls = 0;
			const flaky = () => {
				calls++;
				if (calls === 1) {
					throw new Error("ERR");
				}
				return "ok";
			};
			const first = retry({}, flaky, { times: 3, delay });
			await vi.advanceTimersByTimeAsync(100);
			await expect(first).resolves.toBe("ok");

			calls = 0;
			const second = retry({}, flaky, { times: 3, delay });
			await vi.advanceTimersByTimeAsync(100);
			await expect(second).resolves.toBe("ok");
		});
	});

	describe("overflow of the pause (growing delays in many backoff libraries)", () => {
		it("many attempts never give a negative or NaN pause", () => {
			const delay = backoff({ base: 100, jitter: true });

			for (const attempt of [50, 1100, 100_000]) {
				const pause = delay(attempt);
				expect(Number.isNaN(pause)).toBe(false);
				expect(pause).toBeGreaterThanOrEqual(0);
			}
		});

		it("with max the pause stays at max however many attempts", () => {
			expect(backoff({ base: 100, max: 5000 })(100_000)).toBe(5000);
		});

		it("a zero from Math.random times an infinite pause is not NaN", () => {
			vi.spyOn(Math, "random").mockReturnValue(0);

			expect(Number.isNaN(backoff({ jitter: true })(100_000))).toBe(false);
		});

		it("a pause over 2^31 - 1 ms waits the whole time, not at once", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			const day = 24 * 60 * 60 * 1000;
			retry({}, handler, {
				times: 2,
				delay: backoff({ base: 30 * day }),
			}).catch(() => {});

			await vi.advanceTimersByTimeAsync(29 * day);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1 * day);
			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("odd attempts", () => {
		it("attempt 0 (the first call of poll) is base / factor", () => {
			expect(backoff({ base: 100 })(0)).toBe(50);
		});

		it("a NaN attempt is waited as 0 by the timers, not as a hang", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			retry({}, handler, {
				times: 2,
				delay: () => backoff()(Number.NaN),
			}).catch(() => {});

			await vi.advanceTimersByTimeAsync(0);
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("a max of 0 gives no pause and no jitter error", () => {
			expect(backoff({ base: 100, max: 0, jitter: true })(3)).toBe(0);
		});
	});
});

describe("regressions: retry in similar libraries", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("p-retry: hooks that throw", () => {
		it("an error of shouldRetry rejects the call and stops retrying", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			const result = retry({}, handler, {
				times: 5,
				shouldRetry: () => {
					throw new Error("hook");
				},
			});

			await expect(result).rejects.toThrow("hook");
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("an error of the delay function rejects the call and stops retrying", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			const result = retry({}, handler, {
				times: 5,
				delay: () => {
					throw new Error("delay");
				},
			});

			await expect(result).rejects.toThrow("delay");
			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("p-retry: signal listeners", () => {
		it("an abort after the call has finished does nothing", async () => {
			const controller = new AbortController();
			const handler = vi.fn(() => "ok");
			await retry({ signal: controller.signal }, handler);

			controller.abort();

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("an already aborted signal does not call the function at all", async () => {
			const controller = new AbortController();
			controller.abort(new Error("stop"));
			const handler = vi.fn(() => "ok");

			await expect(
				retry({ signal: controller.signal }, handler),
			).rejects.toThrow("stop");
			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("cockatiel: timers while waiting", () => {
		it("an abort during the pause clears the timer", async () => {
			const controller = new AbortController();
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			const result = retry({ signal: controller.signal }, handler, {
				times: 3,
				delay: backoff({ base: 10_000 }),
			});
			result.catch(() => {});
			await vi.advanceTimersByTimeAsync(0);
			expect(vi.getTimerCount()).toBe(1);

			controller.abort(new Error("stop"));
			await vi.advanceTimersByTimeAsync(0);

			expect(vi.getTimerCount()).toBe(0);
			await vi.advanceTimersByTimeAsync(60_000);
			expect(handler).toHaveBeenCalledTimes(1);
			await expect(result).rejects.toThrow("stop");
		});

		it("the last failure leaves no timer behind", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			const result = retry({}, handler, {
				times: 2,
				delay: backoff({ base: 100 }),
			});
			result.catch(() => {});

			await vi.advanceTimersByTimeAsync(100);
			await expect(result).rejects.toThrow("ERR");
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("axios-retry: the pause depends on the error", () => {
		it("delay gets the failed attempt and its error", async () => {
			const delayArguments: unknown[][] = [];
			const handler = vi.fn(() => {
				throw Object.assign(new Error("429"), { retryAfter: 700 });
			});
			retry({}, handler, {
				times: 2,
				delay: (attempt, error) => {
					delayArguments.push([attempt, (error as Error).message]);
					return (error as { retryAfter: number }).retryAfter;
				},
			}).catch(() => {});

			await vi.advanceTimersByTimeAsync(699);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(handler).toHaveBeenCalledTimes(2);
			expect(delayArguments).toEqual([[1, "429"]]);
		});

		it("the larger of the backoff and the server's pause can be taken", async () => {
			const exponential = backoff({ base: 100 });
			const handler = vi.fn(() => {
				throw Object.assign(new Error("429"), { retryAfter: 500 });
			});
			retry({}, handler, {
				times: 3,
				delay: (attempt, error) =>
					Math.max(
						exponential(attempt),
						(error as { retryAfter: number }).retryAfter,
					),
			}).catch(() => {});

			await vi.advanceTimersByTimeAsync(500);
			expect(handler).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(500);
			expect(handler).toHaveBeenCalledTimes(3);
		});
	});

	describe("a delay that is not a usable number", () => {
		it.each([
			["undefined", () => void 0],
			["NaN", () => Number.NaN],
			["negative", () => -50],
		])("%s means no pause, not a hang", async (_name, delayFunction) => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			retry({}, handler, {
				times: 2,
				delay: delayFunction as () => number,
			}).catch(() => {});

			await vi.advanceTimersByTimeAsync(0);

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("odd numbers of attempts", () => {
		it.each([
			[0, 1],
			[-3, 1],
			[Number.NaN, 1],
		])(
			"times %s still makes the first call (and no more than %s)",
			async (times, calls) => {
				const handler = vi.fn(() => {
					throw new Error("ERR");
				});

				await retry({}, handler, { times }).catch(() => {});

				expect(handler).toHaveBeenCalledTimes(calls);
			},
		);

		it("a fractional times does not make an extra call", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});

			await retry({}, handler, { times: 2.5 }).catch(() => {});

			expect(handler.mock.calls.length).toBeLessThanOrEqual(3);
		});
	});

	describe("backoff with odd factors", () => {
		it("a factor under 1 shrinks the pause, never negative", () => {
			const delay = backoff({ base: 100, factor: 0.5 });

			expect([delay(1), delay(2), delay(3)]).toEqual([100, 50, 25]);
		});

		it("a factor of 1 is a constant pause", () => {
			const delay = backoff({ base: 100, factor: 1 });

			expect([delay(1), delay(5), delay(50)]).toEqual([100, 100, 100]);
		});

		it("a factor of 0 gives the base once, then no pause", () => {
			const delay = backoff({ base: 100, factor: 0 });

			expect([delay(1), delay(2)]).toEqual([100, 0]);
		});

		it("a negative factor never gives a negative pause", () => {
			const delay = backoff({ base: 100, factor: -2 });

			for (const attempt of [1, 2, 3, 4]) {
				expect(delay(attempt)).toBeGreaterThanOrEqual(0);
			}
		});

		it("a fractional base is waited, not rounded to a hang", async () => {
			const handler = vi.fn(() => {
				throw new Error("ERR");
			});
			retry({}, handler, {
				times: 2,
				delay: backoff({ base: 0.5 }),
			}).catch(() => {});

			await vi.advanceTimersByTimeAsync(1);

			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("a shared backoff and a changing Math.random", () => {
		it("each pause draws its own random number", () => {
			const draws = [0.1, 0.9];
			vi.spyOn(Math, "random").mockImplementation(() => draws.shift() ?? 0);
			const delay = backoff({ base: 100, factor: 1, jitter: true });

			expect([delay(1), delay(1)]).toEqual([10, 90]);
			vi.restoreAllMocks();
		});
	});
});

describe("regressions: options that are not set", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("throttle takes undefined and null for leading, trailing and key", async () => {
		const harness = createHarness();
		const fired: number[] = [];
		const throttled = throttle<number, TestEvents, void>(
			100,
			(value) => {
				fired.push(value);
			},
			{ leading: null, trailing: void 0, key: null } as never,
		);
		throttled(1, harness.ctx());
		throttled(2, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(fired).toEqual([1, 2]);
	});

	it("debounce takes undefined and null for leading, trailing and key", async () => {
		const harness = createHarness();
		const fired: number[] = [];
		const debounced = debounce<number, TestEvents, void>(
			100,
			(value) => {
				fired.push(value);
			},
			{ leading: null, trailing: void 0, key: null } as never,
		);
		debounced(1, harness.ctx());
		debounced(2, harness.ctx());
		await vi.advanceTimersByTimeAsync(100);

		expect(fired).toEqual([2]);
	});

	it("queue takes undefined and null for concurrency, limit, overflow and key", async () => {
		vi.useRealTimers();
		const harness = createHarness();
		let running = 0;
		let max = 0;
		const queued = queue<number, TestEvents, void>(
			async () => {
				running++;
				max = Math.max(max, running);
				await Promise.resolve();
				running--;
			},
			{ concurrency: null, limit: void 0, overflow: null, key: null } as never,
		);
		await Promise.all([1, 2, 3].map((value) => queued(value, harness.ctx())));

		expect(max).toBe(1);
	});

	it("poll takes undefined and null for its options", async () => {
		const controller = new AbortController();
		const handler = vi.fn();
		poll(controller, handler, 100, {
			leading: null,
			waitForFn: void 0,
		} as never);
		await vi.advanceTimersByTimeAsync(250);
		controller.abort();

		expect(handler).toHaveBeenCalledTimes(2);
	});
});

describe("regressions: timers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const DAY = 86_400_000;
	const MAX = 2 ** 31 - 1;

	describe("a wait over 2^31 - 1 ms (24.8 days) must not fire at once", () => {
		it("delay waits for the whole time", async () => {
			const done = vi.fn();
			delay({}, 40 * DAY).then(done);
			await vi.advanceTimersByTimeAsync(30 * DAY);
			expect(done).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(10 * DAY);

			expect(done).toHaveBeenCalledTimes(1);
		});

		it("delay does not fire after 1 ms either", async () => {
			const done = vi.fn();
			delay({}, MAX + 1000).then(done);
			await vi.advanceTimersByTimeAsync(5);

			expect(done).not.toHaveBeenCalled();
		});

		it("delay can still be aborted, and then leaves no timer", async () => {
			const controller = new AbortController();
			const promise = delay(controller, 40 * DAY);
			const assertion = expect(promise).rejects.toBe("stop");
			await vi.advanceTimersByTimeAsync(30 * DAY);
			controller.abort("stop");

			await assertion;
			expect(vi.getTimerCount()).toBe(0);
		});

		it("timeout does not expire at once", async () => {
			const starter = deferred<string>();
			const promise = timeout({}, 40 * DAY, () => starter.promise);
			await vi.advanceTimersByTimeAsync(5);
			starter.resolve("done");

			await expect(promise).resolves.toBe("done");
		});

		it("debounce waits for the whole time", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			debounce<number, TestEvents, void>(40 * DAY, handler)(1, harness.ctx());
			await vi.advanceTimersByTimeAsync(30 * DAY);
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(10 * DAY);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("throttle holds a call for the whole window", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const throttled = throttle<number, TestEvents, void>(40 * DAY, handler);
			throttled(1, harness.ctx());
			throttled(2, harness.ctx());
			await vi.advanceTimersByTimeAsync(30 * DAY);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(10 * DAY);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("poll ticks only once the whole time has passed", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			poll(controller, handler, 40 * DAY);
			await vi.advanceTimersByTimeAsync(30 * DAY);
			expect(handler).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(10 * DAY);
			controller.abort();

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("an infinite wait never ends", () => {
		it("delay(Infinity) stays pending, and an abort still ends it", async () => {
			const controller = new AbortController();
			const done = vi.fn();
			const promise = delay(controller, Number.POSITIVE_INFINITY);
			promise.then(done, () => {});
			await vi.advanceTimersByTimeAsync(1000 * DAY);
			expect(done).not.toHaveBeenCalled();
			controller.abort();

			await expect(promise).rejects.toBeDefined();
		});

		it("timeout(Infinity) is no timeout", async () => {
			const starter = deferred<string>();
			const promise = timeout(
				{},
				Number.POSITIVE_INFINITY,
				() => starter.promise,
			);
			await vi.advanceTimersByTimeAsync(1000 * DAY);
			starter.resolve("late but fine");

			await expect(promise).resolves.toBe("late but fine");
		});

		it("leaves no timer behind", async () => {
			const controller = new AbortController();
			delay(controller, Number.POSITIVE_INFINITY).catch(() => {});

			expect(vi.getTimerCount()).toBe(0);
			controller.abort();
		});
	});

	describe("odd waits", () => {
		it("a negative wait is like zero", async () => {
			const done = vi.fn();
			delay({}, -50).then(done);
			await vi.advanceTimersByTimeAsync(0);

			expect(done).toHaveBeenCalledTimes(1);
		});

		it("NaN is like zero", async () => {
			const done = vi.fn();
			delay({}, Number.NaN).then(done);
			await vi.advanceTimersByTimeAsync(0);

			expect(done).toHaveBeenCalledTimes(1);
		});
	});
});

describe("regressions: event emitters", () => {
	it("a listener that unsubscribes itself does not make the next one skipped (mitt, emittery)", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		const off = bus.on("t", () => {
			calls.push("once");
			off();
		});
		bus.on("t", () => calls.push("next"));
		bus.emit("t", 1);
		bus.emit("t", 2);

		expect(calls).toEqual(["once", "next", "next"]);
	});

	it("a listener subscribed twice is called twice, and one unsubscribe leaves the other", () => {
		const bus = createBus<TestEvents>();
		const handler = vi.fn();
		const offFirst = bus.on("t", handler);
		bus.on("t", handler);
		bus.emit("t", 1);
		offFirst();
		bus.emit("t", 2);

		expect(handler).toHaveBeenCalledTimes(3);
	});

	it("unsubscribing a listener that was never subscribed changes nothing", () => {
		const bus = createBus<TestEvents>();
		const kept = vi.fn();
		bus.on("t", kept);
		bus.off("t", () => {});
		bus.emit("t", 1);

		expect(kept).toHaveBeenCalledTimes(1);
	});

	it("off(event, fn) removes one registration of fn", () => {
		const bus = createBus<TestEvents>();
		const handler = vi.fn();
		bus.on("t", handler);
		bus.on("t", handler);
		bus.off("t", handler);
		bus.emit("t", 1);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("clearing an event during its emit still delivers that emit to every listener", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		bus.on("t", () => {
			calls.push("first");
			bus.off("t");
		});
		bus.on("t", () => calls.push("second"));
		bus.emit("t", 1);
		bus.emit("t", 2);

		expect(calls).toEqual(["first", "second"]);
	});

	it("an event emitted from its own listener is delivered to a snapshot, depth first", () => {
		const bus = createBus<TestEvents>();
		const calls: string[] = [];
		bus.on("t", (value, ctx) => {
			calls.push(`a${value}`);
			if (value === 1) {
				ctx.emit("t", 2);
			}
		});
		bus.on("t", (value) => calls.push(`b${value}`));
		bus.emit("t", 1);

		expect(calls).toEqual(["a1", "a2", "b2", "b1"]);
	});

	it("tens of thousands of listeners can be added and removed quickly", () => {
		const bus = createBus<TestEvents>();
		let calls = 0;
		// add is outside the budget: the regression is unsubscribe that slows as n grows
		const offs = Array.from({ length: 50_000 }, () =>
			bus.on("t", () => {
				calls += 1;
			}),
		);
		const start = performance.now();
		for (const off of offs) {
			off();
		}

		expect(performance.now() - start).toBeLessThan(2000);
		bus.emit("t", 1);
		expect(calls).toBe(0);
	});

	it("emitting with no listener at all is fine for every kind of event", () => {
		const bus = createBus<TestEvents>();

		expect(() => {
			bus.emit("t", 1);
			bus.emit({ type: "b", payload: "x" });
		}).not.toThrow();
	});
});
