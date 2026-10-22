// Tricky cases taken from issues of other libraries, run against our retry.
//
// p-retry:    #25, #14, #78, #58, #36, #34
// RxJS:       #674, #5653
// p-retry (signal listeners, hooks that throw), axios-retry (delay from the error),
// cockatiel (timers while waiting): classes of defects, not single issues
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoff, retry } from "../effects";

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
