import { describe, expect, it } from "vitest";
import { createAction, createCommand } from "../actions";
import { createBus, type WithContext } from "../core/bus";
import { contextPlugin } from "../core/context-plugin";
import type { EventMap } from "../core/types";
import { delay, effectsPlugin, race } from "../effects";
import { noPayload } from "../tests/test-helpers";
import { effect, scopePlugin } from ".";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Cache = { readonly name: string };
// a bus that declares the field the calls below replace; the runtime does not need it
type CacheBus = EventMap & WithContext<{ cache?: Cache }>;
const mainCache: Cache = { name: "main" };
const otherCache: Cache = { name: "other" };

describe("scopePlugin", () => {
	it("returns the same bus", () => {
		const bus = createBus();

		expect(bus.use(scopePlugin())).toBe(bus);
	});

	it("ignores a scope on a bus without the plugin", () => {
		const bus = createBus();
		const seen: unknown[] = [];
		const getUser = createCommand(
			"user/get",
			(id: string, ctx) => {
				seen.push(Reflect.get(ctx, "cache"));
				return id;
			},
			{ cache: mainCache },
		);

		expect(bus.emit(getUser("1"))).toBe("1");
		expect(bus.emit(getUser, "2")).toBe("2");
		expect(bus.emit(getUser("3"), { cache: otherCache })).toBe("3");
		expect(seen).toEqual([void 0, void 0, void 0]);
	});

	it("uses a scope as it is now: a field changed after the first use is seen", () => {
		const bus = createBus<CacheBus>().use(scopePlugin());
		const scope = { cache: mainCache };
		const getUser = createCommand(
			"user/get",
			(_id: string, { cache }) => cache,
			scope,
		);

		expect(bus.emit(getUser("1"))).toBe(mainCache);
		Reflect.set(scope, "cache", otherCache);

		expect(bus.emit(getUser("1"))).toBe(otherCache);
	});

	describe("command", () => {
		it("gives its fields to the handler and to the listeners of its type", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			const getUser = createCommand(
				"user/get",
				(id: string, { cache }) => {
					seen.push(["handler", cache]);
					return id;
				},
				{ cache: mainCache },
			);
			bus.on(getUser, (_id, ctx) => {
				seen.push(["listener", Reflect.get(ctx, "cache")]);
			});

			bus.emit(getUser("1"));

			expect(seen).toEqual([
				["listener", mainCache],
				["handler", mainCache],
			]);
		});

		it("gives its fields when it is emitted with a payload, not a call", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const getUser = createCommand(
				"user/get",
				(_id: string, { cache }) => cache,
				{ cache: mainCache },
			);

			expect(bus.emit(getUser, "1")).toBe(mainCache);
		});

		it("does not leave its fields for the next emit", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			const getUser = createCommand(
				"user/get",
				(_id: string, { cache }) => cache,
				{ cache: mainCache },
			);
			bus.on("plain", (_, ctx) => {
				seen.push(Reflect.get(ctx, "cache"));
			});

			bus.emit(getUser("1"));
			bus.emit("plain");

			expect(seen).toEqual([void 0]);
		});
	});

	describe("action", () => {
		it("gives its fields to every listener of its calls", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			const loaded = createAction("user/loaded", {
				cache: mainCache,
			});
			bus.on(loaded, (_user, { cache }) => {
				seen.push(cache);
			});
			bus.on("user/loaded", (_user, ctx) => {
				seen.push(Reflect.get(ctx, "cache"));
			});

			bus.emit(loaded("a"));

			expect(seen).toEqual([mainCache, mainCache]);
		});

		it("keeps match, type and toString", () => {
			const loaded = createAction<string>("user/loaded", {
				cache: mainCache,
			});

			expect(loaded.type).toBe("user/loaded");
			expect(String(loaded)).toBe("user/loaded");
			expect(loaded.match(loaded("a"))).toBe(true);
			expect(loaded("a")).toEqual({ type: "user/loaded", payload: "a" });
		});
	});

	describe("effects", () => {
		it("binds an effect to the task, so it follows the signal", async () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const outcomes: string[] = [];
			const watch = (ctx: { signal: AbortSignal }, label: string) =>
				new Promise<string>((resolve) => {
					ctx.signal.addEventListener("abort", () =>
						resolve(`${label}: aborted`),
					);
				});
			const wait = createCommand(
				"wait",
				async (_: undefined, { watch, abort }) => {
					const pending = watch("job");
					abort();
					outcomes.push(await pending);
				},
				{ $effects: { watch } },
			);

			await bus.emit(wait(noPayload));

			expect(outcomes).toEqual(["job: aborted"]);
		});

		it("binds the built-in effects", async () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const winner = createCommand(
				"winner",
				(_: undefined, { race, delay }) =>
					race({ fast: () => "fast", slow: () => delay(1000) }),
				{ $effects: { race, delay } },
			);

			expect(await bus.emit(winner(noPayload))).toEqual({ fast: "fast" });
		});
	});

	describe("the name effects", () => {
		it("is an ordinary field: that object goes on ctx and nothing in it is bound", () => {
			const bus = createBus().use(scopePlugin());
			const retries = { retries: 3 };
			const read = createCommand("read", (_: undefined, ctx) => ctx.effects, {
				effects: retries,
			});

			expect(bus.emit(read(noPayload))).toBe(retries);
		});
	});

	describe("effect", () => {
		it("binds a function it marked when it is a context value", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			// made where the function is declared, so the generic is kept
			const first = effect(
				<T>(ctx: { signal: AbortSignal }, items: T[]): T | undefined =>
					ctx.signal.aborted ? void 0 : items[0],
			);
			const pick = createCommand(
				"pick",
				(_: undefined, { first }) => first(["a", "b"]),
				{ first },
			);

			expect(bus.emit(pick(noPayload))).toBe("a");
		});

		it("leaves a plain function in context as it is", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const format = (value: number) => `#${value}`;
			const show = createCommand(
				"show",
				(_: undefined, { format }) => format(7),
				{ format },
			);

			expect(bus.emit(show(noPayload))).toBe("#7");
		});
	});

	describe("emit", () => {
		it("replaces a field for this emit only", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const getUser = createCommand(
				"user/get",
				(_id: string, { cache }) => cache,
				{ cache: mainCache },
			);

			expect(bus.emit(getUser("1"), { cache: otherCache })).toBe(otherCache);
			expect(bus.emit(getUser("1"))).toBe(mainCache);
		});

		it("gives fields to a call that has no scope of its own", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			const loaded = createAction("user/loaded");
			bus.on(loaded, (_user, ctx) => {
				seen.push(Reflect.get(ctx, "cache"));
			});

			bus.emit(loaded("a"), { cache: otherCache });
			bus.emit(loaded("b"));

			expect(seen).toEqual([otherCache, void 0]);
		});

		it("replaces an effect", async () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const wait = createCommand(
				"wait",
				(_: undefined, { delay }) => delay(10_000),
				{ $effects: { delay } },
			);
			const instant = (_ctx: { signal: AbortSignal }, _ms: number) =>
				Promise.resolve();

			await bus.emit(wait(noPayload), { $effects: { delay: instant } });
		});

		it("works from a task as well", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			const loaded = createAction("user/loaded");
			bus.on(loaded, (_user, ctx) => {
				seen.push(Reflect.get(ctx, "cache"));
			});
			bus.on("start", (_, ctx) => {
				ctx.emit(loaded("a"), { cache: otherCache });
			});

			bus.emit("start");

			expect(seen).toEqual([otherCache]);
		});

		it("takes a scope only from the call forms: the string form passes its payload on", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			bus.on("saved", (value) => {
				seen.push(value);
			});

			bus.emit("saved", { cache: otherCache });

			expect(seen).toEqual([{ cache: otherCache }]);
		});
	});

	describe("precedence", () => {
		it("the bus, then the command, then emit", () => {
			const bus = createBus({ context: { cache: { name: "bus" } } }).use(
				scopePlugin(),
			);
			const getUser = createCommand(
				"user/get",
				(_id: string, { cache }) => cache,
				{ cache: mainCache },
			);
			const plain = createCommand("plain", (_: undefined, ctx) =>
				Reflect.get(ctx, "cache"),
			);

			expect(bus.emit(plain(noPayload))).toEqual({ name: "bus" });
			expect(bus.emit(getUser("1"))).toBe(mainCache);
			expect(bus.emit(getUser("1"), { cache: otherCache })).toBe(otherCache);
		});

		it("an action and the emit that carries it: emit wins", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			const loaded = createAction("user/loaded", {
				cache: mainCache,
			});
			bus.on(loaded, (_user, { cache }) => {
				seen.push(cache);
			});

			bus.emit(loaded("a"), { cache: otherCache });

			expect(seen).toEqual([otherCache]);
		});

		it("the fields of the library are never replaced", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			const hostile = { signal: "no", emit: "no", run: "no", payload: "no" };
			const check = createCommand("check", (_: undefined, ctx) => {
				seen.push(
					ctx.signal instanceof AbortSignal,
					typeof ctx.emit,
					typeof ctx.run,
					ctx.payload,
				);
			});

			Reflect.apply(bus.emit, bus, [check(noPayload), { ...hostile }]);

			expect(seen).toEqual([true, "function", "function", void 0]);
		});

		it("scopePlugin after effectsPlugin and contextPlugin wins over them", async () => {
			const bus = createBus<{ start: undefined }>()
				.use(contextPlugin({ cache: { name: "bus" } }))
				.use(effectsPlugin({ delay }))
				.use(scopePlugin());
			const seen: unknown[] = [];
			const instant = (_ctx: { signal: AbortSignal }, _ms: number) =>
				Promise.resolve("instant");
			const read = createCommand(
				"read",
				async (_: undefined, { cache, delay }) => {
					seen.push(cache, await delay(1));
				},
				{ cache: mainCache, $effects: { delay: instant } },
			);

			await bus.emit(read(noPayload));

			expect(seen).toEqual([mainCache, "instant"]);
		});
	});

	it("scopePlugin before effectsPlugin keeps the effect it shares a name with", async () => {
		const bus = createBus<CacheBus>()
			.use(scopePlugin())
			.use(effectsPlugin({ delay }));
		const outcomes: string[] = [];
		const instant = (_ctx: { signal: AbortSignal }, _ms: number) =>
			Promise.resolve("instant");
		const read = createCommand(
			"read",
			async (_: undefined, { delay }) => {
				outcomes.push(String(await delay(1)));
			},
			{ $effects: { delay: instant } },
		);

		await bus.emit(read(noPayload));

		// effectsPlugin leaves a field that is there, so the order of the two does not matter
		expect(outcomes).toEqual(["instant"]);
	});

	describe("child tasks", () => {
		it("a child made by ctx.run has the fields, also after an await", async () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			const parent = createCommand(
				"parent",
				async (_: undefined, ctx) => {
					await Promise.resolve();
					await ctx.run((_payload: undefined, child) => {
						seen.push(Reflect.get(child, "cache"));
					});
				},
				{ cache: mainCache },
			);

			await bus.emit(parent(noPayload));

			expect(seen).toEqual([mainCache]);
		});

		it("an effect bound in the parent is bound to the child in the child", async () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: boolean[] = [];
			const aborted = (ctx: { signal: AbortSignal }) => ctx.signal.aborted;
			const parent = createCommand(
				"parent",
				async (_: undefined, ctx) => {
					await ctx.run((_payload: undefined, child) => {
						child.abort();
						seen.push(Reflect.apply(Reflect.get(child, "aborted"), null, []));
					});
				},
				{ $effects: { aborted } },
			);

			await bus.emit(parent(noPayload));

			expect(seen).toEqual([true]);
		});

		it("a task of another emit does not take the scope of the running one", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			bus.on("inner", (_, ctx) => {
				seen.push(Reflect.get(ctx, "cache"));
			});
			const outer = createCommand(
				"outer",
				(_: undefined, ctx) => {
					ctx.emit("inner");
				},
				{ cache: mainCache },
			);

			bus.emit(outer(noPayload));

			expect(seen).toEqual([void 0]);
		});
	});

	describe("errors and nesting", () => {
		it("a throw in a listener leaves no scope for the next emit", () => {
			const bus = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			const loaded = createAction("user/loaded");
			bus.on(loaded, () => {
				throw new Error("boom");
			});
			bus.on("plain", (_, ctx) => {
				seen.push(Reflect.get(ctx, "cache"));
			});

			expect(() => bus.emit(loaded("a"), { cache: otherCache })).toThrow(
				"boom",
			);
			bus.emit("plain");

			expect(seen).toEqual([void 0]);
		});

		it("two buses in one emit do not mix their scopes", () => {
			const first = createBus<CacheBus>().use(scopePlugin());
			const second = createBus<CacheBus>().use(scopePlugin());
			const seen: unknown[] = [];
			second.on("ping", (_, ctx) => {
				seen.push(Reflect.get(ctx, "cache"));
			});
			first.on("go", () => {
				second.emit("ping");
			});
			const go = createAction("go", { cache: mainCache });

			first.emit(go());

			expect(seen).toEqual([void 0]);
		});

		it("an async rejection reaches onError and keeps the scope off the next emit", async () => {
			const errors: unknown[] = [];
			const bus = createBus<CacheBus>({
				onError: (error) => errors.push(error),
			}).use(scopePlugin());
			const seen: unknown[] = [];
			const failing = createAction("failing");
			bus.on(failing, async () => {
				await Promise.resolve();
				throw new Error("late");
			});
			bus.on("plain", (_, ctx) => {
				seen.push(Reflect.get(ctx, "cache"));
			});

			bus.emit(failing(), { cache: otherCache });
			bus.emit("plain");
			await flush();

			expect(errors).toHaveLength(1);
			expect(seen).toEqual([void 0]);
		});
	});
});
