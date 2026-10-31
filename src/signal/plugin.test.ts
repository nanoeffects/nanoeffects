import { describe, expect, it, vi } from "vitest";
import {
	createAction,
	createJob,
	createModule,
	modulePlugin,
} from "../actions";
import { createBus, type WithContext } from "../core/bus";
import type { EventMap } from "../core/types";
import { retry } from "../effects";
import { extendBus } from "../oop";
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
		const getUser = createAction("user/get", async (_: string, ctx) => {
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
		const getUser = createAction(
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
		const getUser = createAction("user/get", (_: string, ctx) =>
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
		const getUser = createAction("user/get", async (_: string, ctx) => {
			seen.push(ctx.signal.aborted);
		});
		await bus.emit(getUser("1"), { signal: AbortSignal.abort() });

		expect(seen).toEqual([true]);
	});

	it("is a cancel for latest and stops retry", async () => {
		const bus = createBus().use(signalPlugin());
		const attempts = vi.fn();
		const getUser = createAction(
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
		const other = createAction("other", async (_: string, ctx) => ctx.signal);
		const seen: boolean[] = [];
		const outer = createAction("outer", async (_: string, ctx) => {
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
		const getUser = createAction("user/get", async (id: string) => id);
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
			const getUser = createAction("user/get", async (_: string, ctx) => {
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
		it("an action that finished keeps nothing on a long-lived signal", async () => {
			const bus = createBus().use(signalPlugin());
			const refs: Array<WeakRef<object>> = [];
			const getUser = createAction("user/get", async (id: string, ctx) => {
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

		it("an action with a sync handler too", async () => {
			const bus = createBus().use(signalPlugin());
			const refs: Array<WeakRef<object>> = [];
			const getUser = createAction("user/get", (id: string, ctx) => {
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
	describe("the signal of a listener", () => {
		it("removes the listener of on when the signal aborts", () => {
			const bus = createBus<{ saved: number }>().use(signalPlugin());
			const handler = vi.fn();
			const controller = new AbortController();
			bus.on("saved", handler, { signal: controller.signal });
			bus.emit("saved", 1);
			controller.abort();
			bus.emit("saved", 2);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(bus.get("saved")).toHaveLength(0);
		});

		it("adds no listener for a signal that is aborted already", () => {
			const bus = createBus<{ saved: number }>().use(signalPlugin());
			const handler = vi.fn();
			const unbind = bus.on("saved", handler, {
				signal: AbortSignal.abort(),
			});
			bus.emit("saved", 1);

			expect(handler).not.toHaveBeenCalled();
			expect(bus.get("saved")).toHaveLength(0);
			expect(() => unbind()).not.toThrow();
		});

		it("does not abort a handler that already runs", async () => {
			const bus = createBus<{ saved: number }>().use(signalPlugin());
			const gate = deferred<void>();
			const seen: boolean[] = [];
			const controller = new AbortController();
			bus.on(
				"saved",
				async (_payload, ctx) => {
					await gate.promise;
					seen.push(ctx.signal.aborted);
				},
				{ signal: controller.signal },
			);
			bus.emit("saved", 1);
			controller.abort();
			gate.resolve();
			await gate.promise;
			await Promise.resolve();

			expect(seen).toEqual([false]);
		});

		it("removes a once that has not run", () => {
			const bus = createBus<{ saved: number }>().use(signalPlugin());
			const handler = vi.fn();
			const controller = new AbortController();
			bus.once("saved", handler, { signal: controller.signal });
			controller.abort();
			bus.emit("saved", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("runs a once one time and lets the signal go", async () => {
			const bus = createBus<{ saved: number }>().use(signalPlugin());
			const handler = vi.fn();
			const controller = new AbortController();
			bus.once("saved", handler, { signal: controller.signal });
			bus.emit("saved", 1);
			bus.emit("saved", 2);
			controller.abort();

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(1, expect.anything());
		});

		it("returns an unsubscribe that works before the abort", () => {
			const bus = createBus<{ saved: number }>().use(signalPlugin());
			const handler = vi.fn();
			const controller = new AbortController();
			const unbind = bus.on("saved", handler, { signal: controller.signal });
			unbind();
			bus.emit("saved", 1);
			controller.abort();

			expect(handler).not.toHaveBeenCalled();
			expect(bus.get("saved")).toHaveLength(0);
		});

		it("keeps nothing alive on a long-lived signal", async () => {
			const bus = createBus<{ saved: number }>().use(signalPlugin());
			const refs: Array<WeakRef<object>> = [];
			const controller = new AbortController();
			// the listeners are made in a function of their own, so no local of the test holds the last one
			const listenAndLeave = () => {
				for (let round = 0; round < 500; round++) {
					const owner = {};
					refs.push(new WeakRef(owner));
					const unbind = bus.on("saved", () => owner, {
						signal: controller.signal,
					});
					unbind();
				}
			};
			listenAndLeave();
			await settleGarbage();

			expect(aliveCount(refs)).toBe(0);
		});

		it("reaches the on of a task context, of a module and of a class", () => {
			const bus = createBus<{ saved: number; start: number }>().use(
				signalPlugin(),
			);
			const seen: string[] = [];
			const controller = new AbortController();
			const { signal } = controller;
			bus.use(
				modulePlugin([
					createModule("listener", (moduleContext) => {
						moduleContext.on("saved", () => seen.push("module"), { signal });
					}),
				]),
			);
			bus.on("start", (_payload, ctx) => {
				ctx.on("saved", () => seen.push("task"), { signal });
			});
			class Service {}
			const Extended = extendBus(bus, Service);
			const service = new Extended();
			service.on("saved", () => seen.push("class"), { signal });
			bus.emit("start", 1);
			bus.emit("saved", 1);
			controller.abort();
			bus.emit("saved", 2);

			expect(seen.sort()).toEqual(["class", "module", "task"]);
		});

		it("ignores the signal without the plugin", () => {
			const bus = createBus<{ saved: number }>();
			const handler = vi.fn();
			const controller = new AbortController();
			bus.on("saved", handler, { signal: controller.signal });
			controller.abort();
			bus.emit("saved", 1);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("passes the other options on", () => {
			const bus = createBus<{ saved: number }>();
			const received: unknown[] = [];
			const base = bus.on;
			const spy = (event: string, handler: () => void, options?: object) => {
				received.push(options);
				return Reflect.apply(base, bus, [event, handler, options]);
			};
			bus.on = spy as typeof bus.on;
			bus.use(signalPlugin());
			const controller = new AbortController();
			const options = { traceId: "named", signal: controller.signal };
			bus.on("saved", () => {}, options);

			expect(received).toEqual([options]);
		});
	});
});
