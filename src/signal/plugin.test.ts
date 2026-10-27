import { describe, expect, it, vi } from "vitest";
import { createAction, createCommand, createJob } from "../actions";
import { createBus, type WithContext } from "../core/bus";
import type { EventMap } from "../core/types";
import { retry } from "../effects";
import { latest } from "../policies";
import { scopePlugin } from "../scope";
import { aliveCount, deferred, settleGarbage } from "../tests/test-helpers";
import { signalPlugin } from ".";

const stopOn = (signal: AbortSignal) =>
	new Promise<never>((_, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason));
	});

describe("signalPlugin", () => {
	it("returns the same bus", () => {
		const bus = createBus();

		expect(bus.use(signalPlugin())).toBe(bus);
	});

	it("aborts the handler with the reason of the outside signal", async () => {
		const bus = createBus().use(signalPlugin());
		const gate = deferred<string>();
		const seen: unknown[] = [];
		const getUser = createCommand("user/get", async (_: string, ctx) => {
			seen.push(ctx.signal.aborted);
			ctx.signal.addEventListener("abort", () => {
				seen.push(ctx.signal.reason);
			});
			return gate.promise;
		});
		const controller = new AbortController();
		const result = bus.emit(getUser("1"), { signal: controller.signal });
		const reason = new Error("unmounted");
		controller.abort(reason);
		gate.resolve("late");
		await result;

		expect(seen).toEqual([false, reason]);
	});

	it("returns the result of the handler", async () => {
		const bus = createBus().use(signalPlugin());
		const getUser = createCommand(
			"user/get",
			async (id: string) => `user ${id}`,
		);
		const controller = new AbortController();

		await expect(
			bus.emit(getUser("1"), { signal: controller.signal }),
		).resolves.toBe("user 1");
	});

	it("rejects a handler that stops on the signal, as for any abort", async () => {
		const bus = createBus().use(signalPlugin());
		const getUser = createCommand("user/get", (_: string, ctx) =>
			stopOn(ctx.signal),
		);
		const controller = new AbortController();
		const result = bus.emit(getUser("1"), { signal: controller.signal });
		controller.abort(new Error("stop"));

		await expect(result).rejects.toThrow("stop");
	});

	it("aborts the tasks at once when the signal is aborted already", async () => {
		const bus = createBus().use(signalPlugin());
		const seen: boolean[] = [];
		const getUser = createCommand("user/get", async (_: string, ctx) => {
			seen.push(ctx.signal.aborted);
		});
		await bus.emit(getUser("1"), { signal: AbortSignal.abort() });

		expect(seen).toEqual([true]);
	});

	it("is a cancel for latest and stops retry", async () => {
		const bus = createBus().use(signalPlugin());
		const attempts = vi.fn();
		const getUser = createCommand(
			"user/get",
			latest(async (_: string, ctx) => {
				const stop = stopOn(ctx.signal);
				return retry(ctx, () => {
					attempts();
					return stop;
				});
			}),
		);
		const controller = new AbortController();
		const result = bus.emit(getUser("1"), { signal: controller.signal });
		controller.abort(new Error("stop"));

		await expect(result).resolves.toBeUndefined();
		expect(attempts).toHaveBeenCalledTimes(1);
	});

	it("makes a job send cancel", async () => {
		const bus = createBus().use(signalPlugin());
		const gate = deferred<string>();
		const getUser = createJob("user/get", async (_: string, ctx) => {
			await Promise.race([gate.promise, stopOn(ctx.signal)]);
			return "x";
		});
		const seen: string[] = [];
		for (const name of ["pending", "success", "fail", "cancel"] as const) {
			bus.on(getUser[name], () => {
				seen.push(name);
			});
		}
		const controller = new AbortController();
		const result = bus.emit(getUser("1"), { signal: controller.signal });
		controller.abort();
		await result;

		expect(seen).toEqual(["pending", "cancel"]);
	});

	it("aborts the listeners of the type of an action", () => {
		const bus = createBus().use(signalPlugin());
		const loaded = createAction<string, "loaded">("loaded");
		const seen: boolean[] = [];
		const controller = new AbortController();
		bus.on(loaded, (_user, ctx) => {
			ctx.signal.addEventListener("abort", () => {
				seen.push(true);
			});
		});
		bus.emit(loaded("1"), { signal: controller.signal });
		controller.abort();

		expect(seen).toEqual([true]);
	});

	it("does not link a separate emit that a handler makes", async () => {
		const bus = createBus().use(signalPlugin());
		const other = createCommand("other", async (_: string, ctx) => ctx.signal);
		const seen: boolean[] = [];
		const outer = createCommand("outer", async (_: string, ctx) => {
			const innerSignal = await ctx.emit(other("1"));
			seen.push(innerSignal.aborted);
		});
		const controller = new AbortController();
		const result = bus.emit(outer("1"), { signal: controller.signal });
		controller.abort();
		await result;

		expect(seen).toEqual([false]);
	});

	it("adds no listener without a signal", async () => {
		const bus = createBus().use(signalPlugin());
		const getUser = createCommand("user/get", async (id: string) => id);
		const add = vi.spyOn(AbortSignal.prototype, "addEventListener");
		await bus.emit(getUser("1"));
		const added = add.mock.calls.filter(([type]) => type === "abort").length;
		add.mockRestore();

		expect(added).toBe(0);
	});

	it("takes the options as a scope too, in either order of the plugins", async () => {
		type Fields = EventMap & WithContext<{ api?: string }>;
		const orders = [
			() => createBus<Fields>().use(scopePlugin()).use(signalPlugin()),
			() => createBus<Fields>().use(signalPlugin()).use(scopePlugin()),
		];
		for (const make of orders) {
			const bus = make();
			const seen: unknown[] = [];
			const gate = deferred<string>();
			const getUser = createCommand("user/get", async (_: string, ctx) => {
				seen.push(Reflect.get(ctx, "api"));
				await Promise.race([gate.promise, stopOn(ctx.signal)]).catch(() => {});
				seen.push(ctx.signal.aborted);
			});
			const controller = new AbortController();
			const result = bus.emit(getUser("1"), {
				api: "fake",
				signal: controller.signal,
			});
			controller.abort();
			await result;

			expect(seen).toEqual(["fake", true]);
		}
	});

	describe("leaks", () => {
		it("a command that finished keeps nothing on a long-lived signal", async () => {
			const bus = createBus().use(signalPlugin());
			const refs: Array<WeakRef<object>> = [];
			const getUser = createCommand("user/get", async (id: string, ctx) => {
				refs.push(new WeakRef(ctx));
				return id;
			});
			const controller = new AbortController();
			for (let round = 0; round < 50; round++) {
				await bus.emit(getUser("1"), { signal: controller.signal });
			}
			await settleGarbage();

			expect(aliveCount(refs)).toBe(0);
		});

		it("a command with a sync handler too", async () => {
			const bus = createBus().use(signalPlugin());
			const refs: Array<WeakRef<object>> = [];
			const getUser = createCommand("user/get", (id: string, ctx) => {
				refs.push(new WeakRef(ctx));
				return id;
			});
			const controller = new AbortController();
			for (let round = 0; round < 50; round++) {
				bus.emit(getUser("1"), { signal: controller.signal });
			}
			await settleGarbage();

			expect(aliveCount(refs)).toBe(0);
		});
	});
});
