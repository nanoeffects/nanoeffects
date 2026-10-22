import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoff } from "./backoff";
import { poll } from "./poll";
import { retry } from "./retry";

describe("backoff", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("growth", () => {
		it("doubles the pause from the base by default", () => {
			const delay = backoff({ base: 100 });

			expect([delay(1), delay(2), delay(3)]).toEqual([100, 200, 400]);
		});

		it("starts at 100 ms with no options", () => {
			expect(backoff()(1)).toBe(100);
		});

		it("uses the factor", () => {
			const delay = backoff({ base: 10, factor: 3 });

			expect([delay(1), delay(2), delay(3)]).toEqual([10, 30, 90]);
		});

		it("never passes max", () => {
			const delay = backoff({ base: 100, max: 250 });

			expect([delay(1), delay(2), delay(3), delay(10)]).toEqual([
				100, 200, 250, 250,
			]);
		});
	});

	describe("jitter", () => {
		it("returns a part of the pause given by Math.random", () => {
			vi.spyOn(Math, "random").mockReturnValue(0.5);

			expect(backoff({ base: 100, jitter: true })(2)).toBe(100);
		});

		it("stays between 0 and the pause", () => {
			const delay = backoff({ base: 100, jitter: true });

			for (let run = 0; run < 200; run++) {
				const pause = delay(3);
				expect(pause).toBeGreaterThanOrEqual(0);
				expect(pause).toBeLessThanOrEqual(400);
			}
		});

		it("stays under max", () => {
			vi.spyOn(Math, "random").mockReturnValue(0.999);

			expect(backoff({ base: 100, max: 150, jitter: true })(5)).toBeLessThan(
				150,
			);
		});
	});

	describe("options", () => {
		it("falls back to the defaults for null", () => {
			const plain = { base: null, factor: null, max: null, jitter: null };
			// null comes from plain JavaScript callers
			const delay = backoff(plain as never);

			expect(delay(1)).toBe(100);
			expect(delay(2)).toBe(200);
		});

		it("treats a negative or NaN base and max as 0", () => {
			expect(backoff({ base: -5 })(1)).toBe(0);
			expect(backoff({ base: Number.NaN })(3)).toBe(0);
			expect(backoff({ base: 100, max: -1 })(1)).toBe(0);
		});
	});

	describe("with retry", () => {
		it("waits 100 ms, then 200 ms, between three attempts", async () => {
			const handler = vi.fn((_attempt: number) => {
				throw new Error("boom");
			});
			const result = retry({}, handler, {
				times: 3,
				delay: backoff({ base: 100 }),
			});
			result.catch(() => {});

			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(99);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(handler).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(199);
			expect(handler).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(1);
			expect(handler).toHaveBeenCalledTimes(3);
			await expect(result).rejects.toThrow("boom");
		});
	});

	describe("with poll", () => {
		it("slows the calls down; the first pause is base / factor", async () => {
			const controller = new AbortController();
			const handler = vi.fn();
			const stopped = poll(
				{ signal: controller.signal },
				handler,
				backoff({ base: 100 }),
			);

			// call 0 waits 100 * 2 ** -1 = 50 ms, call 1 waits 100 ms
			await vi.advanceTimersByTimeAsync(50);
			expect(handler).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(100);
			expect(handler).toHaveBeenCalledTimes(2);

			controller.abort();
			await stopped;
		});
	});
});
