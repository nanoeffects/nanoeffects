// Tricky cases taken from issues of other libraries, run against backoff.
//
// cockatiel:  #30
// coder/mux:  #548
// RxJS:       retry({ delay })
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoff, retry } from "../effects";

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
