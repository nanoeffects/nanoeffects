import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../core/bus";
import type { EventMap } from "../core/types";
import { deferred } from "../tests/test-helpers";
import { debounce } from "./debounce";
import { latest } from "./latest";
import { queue } from "./queue";
import { throttle } from "./throttle";
import { withPolicy } from "./with-policy";

describe("withPolicy", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("calling a policy as a plain function", () => {
		it("debounces: the callback runs once, with the last payload", async () => {
			const callback = vi.fn((value: number) => value);
			const onChange = withPolicy(debounce(100, callback));
			const first = onChange(1);
			const second = onChange(2);
			await vi.advanceTimersByTimeAsync(100);

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback.mock.calls[0]?.[0]).toBe(2);
			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBe(2);
		});

		it("latest: the first run is aborted and only the second delivers", async () => {
			const gates = [deferred<string>(), deferred<string>()];
			const signals: AbortSignal[] = [];
			const load = withPolicy(
				latest((index: number, { signal }) => {
					signals.push(signal);
					return gates[index]?.promise;
				}),
			);
			const first = load(0);
			const second = load(1);
			gates[0]?.resolve("old");
			gates[1]?.resolve("new");

			expect(signals[0]?.aborted).toBe(true);
			await expect(second).resolves.toBe("new");
			await expect(first).resolves.toBeUndefined();
		});

		it("throttle keeps its window across calls", async () => {
			const callback = vi.fn((value: number) => value);
			const onScroll = withPolicy(throttle(100, callback));
			onScroll(1);
			onScroll(2);
			await vi.advanceTimersByTimeAsync(100);

			expect(callback.mock.calls.map(([value]) => value)).toEqual([1, 2]);
		});

		it("queue runs the calls one after another", async () => {
			const order: number[] = [];
			const gate = deferred();
			const send = withPolicy(
				queue(async (value: number) => {
					order.push(value);
					await gate.promise;
				}),
			);
			const first = send(1);
			const second = send(2);
			await vi.advanceTimersByTimeAsync(0);
			expect(order).toEqual([1]);
			gate.resolve();
			await Promise.all([first, second]);

			expect(order).toEqual([1, 2]);
		});

		it("a task without payload is called with no argument", async () => {
			const task = vi.fn(() => "done");
			const run = withPolicy((_payload: undefined) => task());

			await expect(run()).resolves.toBe("done");
		});

		it("wraps a sync result in a promise", async () => {
			const double = withPolicy((value: number) => value * 2);

			await expect(double(4)).resolves.toBe(8);
		});
	});

	describe("the context of the callback", () => {
		it("gives a signal, abort and run; emit and on do nothing", async () => {
			let seen: Context<EventMap> | undefined;
			const callback = withPolicy((_: string, ctx: Context<EventMap>) => {
				seen = ctx;
			});
			await callback("x");

			expect(seen?.signal).toBeInstanceOf(AbortSignal);
			expect(() => seen?.emit("loaded", 1)).not.toThrow();
			expect(() => seen?.on("loaded", () => {})).not.toThrow();
			await expect(seen?.run(() => 5)).resolves.toBe(5);
		});

		it("ctx.abort aborts the signal of that call only", async () => {
			const signals: AbortSignal[] = [];
			const callback = withPolicy(
				(_: string, { signal, abort }: Context<EventMap>) => {
					signals.push(signal);
					abort();
				},
			);
			await callback("a");
			await callback("b");

			expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
			expect(signals[0]).not.toBe(signals[1]);
		});
	});

	describe("cancel", () => {
		it("a pending debounce never runs and its promise resolves undefined", async () => {
			const callback = vi.fn();
			const onChange = withPolicy(debounce(100, callback));
			const pending = onChange(1);
			onChange.cancel();
			await vi.advanceTimersByTimeAsync(200);

			expect(callback).not.toHaveBeenCalled();
			await expect(pending).resolves.toBeUndefined();
		});

		it("a running call sees an aborted signal with the reason", async () => {
			const gate = deferred();
			let signal: AbortSignal | undefined;
			const run = withPolicy(async (_: number, ctx: Context<EventMap>) => {
				signal = ctx.signal;
				await gate.promise;
			});
			const running = run(1);
			const reason = new Error("stop");
			run.cancel(reason);

			expect(signal?.aborted).toBe(true);
			expect(signal?.reason).toBe(reason);
			gate.resolve();
			await running;
		});

		it("works again after cancel", async () => {
			const callback = vi.fn((value: number) => value);
			const onChange = withPolicy(debounce(100, callback));
			onChange.cancel();
			const result = onChange(2);
			await vi.advanceTimersByTimeAsync(100);

			await expect(result).resolves.toBe(2);
			expect(callback).toHaveBeenCalledTimes(1);
		});

		it("does nothing with no pending call", () => {
			const onChange = withPolicy(debounce(100, () => {}));

			expect(() => onChange.cancel()).not.toThrow();
		});
	});

	describe("dispose", () => {
		it("[Symbol.dispose] cancels like cancel", async () => {
			const callback = vi.fn();
			const onChange = withPolicy(debounce(100, callback));
			onChange(1);
			onChange[Symbol.dispose]?.();
			await vi.advanceTimersByTimeAsync(200);

			expect(callback).not.toHaveBeenCalled();
		});

		it("makes a working function where Symbol.dispose does not exist", async () => {
			// Symbol.dispose cannot be deleted, so the global is replaced for a fresh import
			const realSymbol = Symbol;
			const withoutDispose = new Proxy(() => {}, {
				get: (_target, key) =>
					key === "dispose" ? void 0 : Reflect.get(realSymbol, key),
			});
			vi.stubGlobal("Symbol", withoutDispose);
			vi.resetModules();
			try {
				const { withPolicy: made } = await import("./with-policy");
				const run = made((value: number) => value + 1);

				await expect(run(1)).resolves.toBe(2);
				expect(Object.getOwnPropertySymbols(run)).toEqual([]);
				expect(typeof run.cancel).toBe("function");
			} finally {
				vi.unstubAllGlobals();
			}
		});
	});

	describe("errors", () => {
		it("a thrown error rejects the promise", async () => {
			const failing = withPolicy(() => {
				throw new Error("x");
			});

			await expect(failing()).rejects.toThrow("x");
		});

		it("a rejection rejects the promise", async () => {
			const failing = withPolicy(() => Promise.reject(new Error("y")));

			await expect(failing()).rejects.toThrow("y");
		});
	});
});
