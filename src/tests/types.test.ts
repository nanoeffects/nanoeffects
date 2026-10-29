// What a user sees from the type checker: payloads and contexts are inferred
// without writing generics, and wrong calls are errors. Nothing here runs
// anything that matters; `pnpm tsgo` is the test.
import { describe, expectTypeOf, it } from "vitest";
import {
	bindHandler,
	commandsPlugin,
	createAction,
	createCommand,
	createJob,
	createModule,
	emitterPlugin,
	modulePlugin,
} from "../actions";
import {
	type Context,
	createBus,
	type EventsOf,
	type WithContext,
} from "../core/bus";
import { contextPlugin } from "../core/context-plugin";
import type { Effect } from "../core/effect-types";
import type { EventMap, Task, UnsubscribeCallback } from "../core/types";
import {
	all,
	allSettled,
	cancellable,
	delay,
	effectsPlugin,
	poll,
	race,
	retry,
	take,
	timeout,
} from "../effects";
import { matchPlugin } from "../match";
import { type BusMethods, extendBus, On } from "../oop";
import {
	debounce,
	latest,
	leading,
	queue,
	throttle,
	withPolicy,
} from "../policies";
import { reactPlugin, usePolicy } from "../react";
import { effect } from "../scope";
import { signalPlugin } from "../signal";
import { createEffectsMiddleware, type ReduxStoreApi } from "../store/redux";

type User = { id: string; name: string };
type Events = {
	search: string;
	loaded: User;
	tick: undefined;
	count: number;
	"counter/added": number;
};

const bus = createBus<Events>();

describe("inference of handlers and policies", () => {
	it("a plain handler gets the payload and the context", () => {
		bus.on("search", (query, ctx) => {
			expectTypeOf(query).toEqualTypeOf<string>();
			expectTypeOf(ctx).toEqualTypeOf<Context<Events>>();
			expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>();
		});
	});

	it("once takes the same payload as on; off() clears every listener", () => {
		bus.once("search", (query, ctx) => {
			expectTypeOf(query).toEqualTypeOf<string>();
			expectTypeOf(ctx).toEqualTypeOf<Context<Events>>();
		});
		bus.off();
		bus.off("search");
		// @ts-expect-error the payload of search is a string
		bus.once("search", (query: number) => query);
	});

	it("latest, leading, queue take the payload from the event", () => {
		bus.on(
			"loaded",
			latest((user, ctx) => {
				expectTypeOf(user).toEqualTypeOf<User>();
				expectTypeOf(ctx).toEqualTypeOf<Context<Events>>();
			}),
		);
		bus.on(
			"search",
			leading((query) => {
				expectTypeOf(query).toEqualTypeOf<string>();
			}),
		);
		bus.on(
			"count",
			queue((count) => {
				expectTypeOf(count).toEqualTypeOf<number>();
			}),
		);
	});

	it("debounce and throttle take the payload from the event", () => {
		bus.on(
			"search",
			debounce(100, (query) => {
				expectTypeOf(query).toEqualTypeOf<string>();
			}),
		);
		bus.on(
			"count",
			throttle(100, (count) => {
				expectTypeOf(count).toEqualTypeOf<number>();
			}),
		);
	});

	it("an async handler in a policy is fine", () => {
		bus.on(
			"search",
			latest(async (query, { signal }) => {
				expectTypeOf(query).toEqualTypeOf<string>();
				await fetch(`/search?q=${query}`, { signal });
			}),
		);
	});

	it("policies can wrap each other", () => {
		bus.on(
			"search",
			debounce(
				100,
				latest((query) => {
					expectTypeOf(query).toEqualTypeOf<string>();
				}),
			),
		);
	});

	it("the key option gets the payload", () => {
		bus.on(
			"loaded",
			latest(() => {}, {
				key: (user) => {
					expectTypeOf(user).toEqualTypeOf<User>();
					return user.id;
				},
			}),
		);
		bus.on(
			"loaded",
			queue(() => {}, {
				key: (user) => user.id,
				concurrency: 2,
				limit: 5,
				overflow: "drop-old",
			}),
		);
	});

	it("a handler of an event without data takes no payload", () => {
		bus.on(
			"tick",
			latest(() => {}),
		);
		bus.emit("tick");
	});

	it("on returns the function that unsubscribes", () => {
		const off = bus.on(
			"search",
			latest(() => {}),
		);
		expectTypeOf(off).toEqualTypeOf<UnsubscribeCallback>();
	});

	it("wrong calls are errors", () => {
		// not called: it only has to fail to compile
		const wrongCalls = () => {
			// @ts-expect-error the payload of search is a string
			bus.emit("search", 1);
			// @ts-expect-error there is no such event
			bus.on("missing", () => {});
			bus.on(
				// @ts-expect-error the handler gets a string, not a number
				"search",
				latest((query: number) => query),
			);
			bus.on(
				"search",
				// @ts-expect-error an unknown option
				queue(() => {}, { concurency: 2 }),
			);
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});
});

describe("results of effects", () => {
	it("retry, timeout and poll", () => {
		bus.on("search", async (_, ctx) => {
			const value = await retry(ctx, async () => 1);
			expectTypeOf(value).toEqualTypeOf<number>();

			const text = await timeout(ctx, 100, async () => "text");
			expectTypeOf(text).toEqualTypeOf<string>();

			expectTypeOf(poll(ctx, () => {}, 100)).resolves.toBeVoid();
		});
	});

	it("all and allSettled keep the shape of the input", () => {
		bus.on("search", async (_, ctx) => {
			const results = await all(ctx, {
				user: async () => ({ id: "1", name: "a" }),
				count: async () => 1,
			});
			expectTypeOf(results.user).toEqualTypeOf<User>();
			expectTypeOf(results.count).toEqualTypeOf<number>();

			const list = await all(ctx, [async () => "a", async () => 1]);
			expectTypeOf(list[0]).toEqualTypeOf<string>();
			expectTypeOf(list[1]).toEqualTypeOf<number>();

			const settled = await allSettled(ctx, { count: async () => 1 });
			expectTypeOf(settled.count.status).toEqualTypeOf<
				"fulfilled" | "rejected"
			>();
		});
	});

	it("race holds only the winner, under its key", () => {
		bus.on("search", async (_, ctx) => {
			const winner = await race(ctx, {
				fast: async () => 1,
				slow: async () => "text",
			});
			expectTypeOf(winner.fast).toEqualTypeOf<number | undefined>();
			expectTypeOf(winner.slow).toEqualTypeOf<string | undefined>();
		});
	});

	it("cancellable is a promise of void unless told the value", () => {
		bus.on("search", async (_, ctx) => {
			const nothing = cancellable(ctx, ({ resolve }) => resolve());
			expectTypeOf(nothing).resolves.toBeVoid();

			const value = cancellable<number>(ctx, ({ resolve }) => resolve(5));
			expectTypeOf(value).resolves.toEqualTypeOf<number>();
		});
	});

	it("take resolves with the payload of the event", () => {
		bus.on("search", async (_, ctx) => {
			const user = await take(ctx, "loaded");
			expectTypeOf(user).toEqualTypeOf<User>();
		});
	});

	it("take narrows the result with a type guard predicate", () => {
		type Admin = User & { admin: true };
		const isAdmin = (user: User): user is Admin => "admin" in user;

		bus.on("search", async (_, ctx) => {
			const admin = await take(ctx, "loaded", { predicate: isAdmin });
			expectTypeOf(admin).toEqualTypeOf<Admin>();

			const anyone = await take(ctx, "loaded", {
				predicate: (user) => user.id !== "",
			});
			expectTypeOf(anyone).toEqualTypeOf<User>();
		});
	});
});

describe("actions, commands and jobs", () => {
	it("an action creator is an event of its type", () => {
		const added = createAction<number, "counter/added">("counter/added");
		expectTypeOf(added(2).payload).toEqualTypeOf<number>();
		bus.on(added, (count) => {
			expectTypeOf(count).toEqualTypeOf<number>();
		});
		bus.emit(added(2));
		// @ts-expect-error the payload is a number
		added("2");
	});

	it("a command gives its result to emit", () => {
		const getUser = createCommand("user/get", async (id: string) => ({
			id,
			name: "a",
		}));
		const result = bus.emit(getUser, "1");
		expectTypeOf(result).resolves.toEqualTypeOf<{ id: string; name: string }>();
		// @ts-expect-error the payload is a string
		bus.emit(getUser, 1);
	});

	it("a command without a handler is a typed contract", () => {
		const sendMail = createCommand<{ to: string }, boolean>("mail/send");
		// not called: a command without a handler throws when it runs
		const send = () => bus.emit(sendMail, { to: "a" });
		expectTypeOf(send).returns.toEqualTypeOf<boolean>();
	});

	it("a job gives a promise of the result", () => {
		const loaded = createAction<User, "user/loaded">("user/loaded");
		const loadUser = createJob(
			"user/load",
			async (id: string) => ({ id, name: "a" }),
			{ success: loaded },
		);
		expectTypeOf(bus.emit(loadUser, "1")).resolves.toEqualTypeOf<
			User | undefined
		>();
	});
});

describe("a bus without an event map", () => {
	const loose = createBus();

	it("takes any event and passes the payload as unknown", () => {
		loose.on("anything", (payload) => {
			expectTypeOf(payload).toEqualTypeOf<unknown>();
		});
		loose.emit("anything", 1);
	});

	it("takes the payload type from actions and commands", () => {
		const added = createAction<number, "counter/added">("counter/added");
		const getUser = createCommand("user/get", async (id: string) => ({ id }));

		loose.on(added, (count) => {
			expectTypeOf(count).toEqualTypeOf<number>();
		});
		loose.on(
			getUser,
			latest((id) => {
				expectTypeOf(id).toEqualTypeOf<string>();
			}),
		);
		loose.emit(added(2));
		expectTypeOf(loose.emit(getUser, "1")).resolves.toEqualTypeOf<{
			id: string;
		}>();
	});

	it("wrong payloads of actions and commands are still errors", () => {
		const added = createAction<number, "counter/added">("counter/added");

		// @ts-expect-error the payload of the action is a number
		added("2");
	});
});

describe("fields of the context from the event map", () => {
	type Store = { readonly name: string };
	type StoreEvents = { save: User } & WithContext<{ store: Store }>;

	it("the context has the fields, in handlers and in policies", () => {
		const withStore = createBus<StoreEvents>({
			context: { store: { name: "main" } },
		});
		withStore.on("save", (_, ctx) => {
			expectTypeOf(ctx.store).toEqualTypeOf<Store>();
		});
		withStore.on(
			"save",
			latest((_, ctx) => {
				expectTypeOf(ctx.store).toEqualTypeOf<Store>();
			}),
		);
	});

	it("the option is checked against the fields", () => {
		const wrongOptions = () => {
			// @ts-expect-error the store must have a name
			createBus<StoreEvents>({ context: { store: { id: 1 } } });
		};
		expectTypeOf(wrongOptions).toBeFunction();
	});

	it("without WithContext the context has no extra fields", () => {
		bus.on("search", (_, ctx) => {
			// @ts-expect-error there is no store in this bus
			void ctx.store;
		});
	});

	it("a function makes the fields for each task", () => {
		createBus<StoreEvents>({
			context: (task) => ({ store: { name: task.type } }),
		});
	});
});

describe("an action without generics", () => {
	type Events = { "user/loaded": User; tick: undefined; "count/set": number };
	const typed = createBus<Events>();

	it("keeps its literal type and takes the payload from the event map of the bus", () => {
		const userLoaded = createAction("user/loaded");
		expectTypeOf(userLoaded.type).toEqualTypeOf<"user/loaded">();
		expectTypeOf(userLoaded({ id: "1", name: "a" })).toEqualTypeOf<{
			type: "user/loaded";
			payload: { id: string; name: string };
		}>();

		typed.on(userLoaded, (user) => {
			expectTypeOf(user).toEqualTypeOf<User>();
		});
		typed.emit(userLoaded({ id: "1", name: "a" }));
	});

	it("the bus checks the payload of a call against its map", () => {
		const userLoaded = createAction("user/loaded");
		const wrongCalls = () => {
			// @ts-expect-error the payload of user/loaded is a user
			typed.emit(userLoaded(5));
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});

	it("an action without data takes no argument", () => {
		const tick = createAction("tick");
		expectTypeOf(tick()).toEqualTypeOf<{ type: "tick"; payload: undefined }>();
		typed.emit(tick());
	});

	it("an action that is not in the map is an error on that bus", () => {
		const other = createAction("other");
		const wrongCalls = () => {
			// @ts-expect-error there is no such event in the map
			typed.emit(other());
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});

	it("on a bus without a map the payload is unknown, and createAction<Payload> gives it", () => {
		const loose = createBus();
		const free = createAction("free/event");
		loose.on(free, (payload) => {
			expectTypeOf(payload).toEqualTypeOf<unknown>();
		});

		const typedAction = createAction<User>("user/loaded");
		loose.on(typedAction, (user) => {
			expectTypeOf(user).toEqualTypeOf<User>();
		});
		expectTypeOf(
			typedAction({ id: "1", name: "a" }).payload,
		).toEqualTypeOf<User>();
	});

	it("match tells the type", () => {
		const userLoaded = createAction("user/loaded");
		const action: { type: string; payload?: unknown } = {
			type: "user/loaded",
			payload: 1,
		};
		if (userLoaded.match(action)) {
			expectTypeOf(action.type).toEqualTypeOf<"user/loaded">();
		}
	});
});

describe("effects as Tasks", () => {
	type Item = { id: number };
	const api = {
		search: async (
			_query: string,
			_options: { signal: AbortSignal },
		): Promise<Item[]> => [],
	};
	type Events = { search: string; scroll: number; results: Item[] };
	const typed = createBus<Events>();
	const search = async (query: string, { signal }: { signal: AbortSignal }) =>
		api.search(query, { signal });

	it("retry, timeout and poll in on(...) infer the payload and the context from the event", () => {
		typed.on(
			"search",
			latest(
				retry(
					timeout(5000, (query, ctx) => {
						expectTypeOf(query).toEqualTypeOf<string>();
						expectTypeOf(ctx).toEqualTypeOf<Context<Events>>();
						return api.search(query, { signal: ctx.signal });
					}),
					{ times: 3 },
				),
			),
		);
		typed.on(
			"scroll",
			poll(1000, (position, ctx) => {
				expectTypeOf(position).toEqualTypeOf<number>();
				expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>();
			}),
		);
	});

	it("a wrapped Task is a Task: it goes through ctx.run and gives its result", () => {
		typed.on("search", async (query, ctx) => {
			const items = await ctx.run(retry(search), query);
			expectTypeOf(items).toEqualTypeOf<Item[]>();

			const guarded = await ctx.run(timeout(100, search), query);
			expectTypeOf(guarded).toEqualTypeOf<Item[]>();
		});
	});

	it("the ctx form is unchanged", () => {
		typed.on("search", async (query, ctx) => {
			const items = await retry(ctx, () =>
				api.search(query, { signal: ctx.signal }),
			);
			expectTypeOf(items).toEqualTypeOf<Item[]>();

			const text = await timeout(ctx, 100, async () => "text");
			expectTypeOf(text).toEqualTypeOf<string>();

			expectTypeOf(poll(ctx, () => {}, 100)).resolves.toBeVoid();
		});
	});

	it("wrong calls are errors", () => {
		const wrongCalls = () => {
			// @ts-expect-error the options of retry have no such field
			retry(search, { time: 3 });
			// @ts-expect-error the limit is a number
			timeout("100", search);
			// @ts-expect-error the pause is a number or a function
			poll("100", search);
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});
});

describe("commands on the bus", () => {
	type Events = { greet: string };
	const getUser = createCommand<string, Promise<User>>("user/get");

	it("bus.use(commandsPlugin()) takes the events from the bus and binds handlers", () => {
		const bus = createBus<Events>();
		const commands = bus.use(commandsPlugin());
		const unbind = commands.handle(getUser, async (id, ctx) => {
			expectTypeOf(id).toEqualTypeOf<string>();
			expectTypeOf(ctx).toEqualTypeOf<Context<Events>>();
			return { id, name: "a" };
		});
		expectTypeOf(unbind).toEqualTypeOf<UnsubscribeCallback>();
		expectTypeOf(bus.emit(getUser, "1")).resolves.toEqualTypeOf<User>();
	});

	it("bindings keep the payload types of their commands", () => {
		const bus = createBus<Events>();
		const commands = bus.use(
			commandsPlugin([
				bindHandler(getUser, async (id) => {
					expectTypeOf(id).toEqualTypeOf<string>();
					return { id, name: "a" };
				}),
			]),
		);
		expectTypeOf(commands.handle).toBeFunction();
	});

	it("the constructor has no commands option", () => {
		const wrongCalls = () => {
			const other = createBus<Events>();
			// @ts-expect-error commands are attached with bus.use(commandsPlugin())
			createBus<Events>({ commands: other.use(commandsPlugin()) });
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});

	it("a module brings commands and modules with use, and nothing else", () => {
		const double = createCommand("math/double", (value: number) => value * 2);
		const sub = createModule<Events>("sub", () => {});
		createModule<Events>("parent", (moduleContext) => {
			expectTypeOf(
				moduleContext.use(double, sub),
			).toEqualTypeOf<UnsubscribeCallback>();
			// @ts-expect-error a string is neither a command nor a module
			moduleContext.use("math/double");
			// @ts-expect-error an event is neither a command nor a module
			moduleContext.use({ type: "greet", payload: "x" });
		});
	});
});

describe("a job", () => {
	type Item = { id: number };
	const fetchItem = async (id: string): Promise<Item> => ({ id: Number(id) });

	it("returns the command and two actions, made from strings with the literal types", () => {
		const command = createJob("item/load", fetchItem, {
			success: "item/loaded",
			fail: "item/failed",
		});
		const { success: successAction, fail: failAction } = command;

		expectTypeOf(command.type).toEqualTypeOf<"item/load">();
		expectTypeOf(successAction.type).toEqualTypeOf<"item/loaded">();
		expectTypeOf(failAction.type).toEqualTypeOf<"item/failed">();
		expectTypeOf(successAction({ id: 1 }).payload).toEqualTypeOf<Item>();
		expectTypeOf(failAction(new Error("x")).payload).toEqualTypeOf<unknown>();
	});

	it("a command narrows an action with match", () => {
		const getItem = createCommand("item/get", (id: string) => id);
		const action: { type: string; payload?: unknown } = { type: "item/get" };
		if (getItem.match(action)) {
			expectTypeOf(action.type).toEqualTypeOf<"item/get">();
			expectTypeOf(action.payload).toEqualTypeOf<string>();
		}
	});

	it("makes the missing actions with the types <type>/success and <type>/fail", () => {
		const command = createJob("item/load", fetchItem);
		const { success: successAction, fail: failAction } = command;

		expectTypeOf(successAction.type).toEqualTypeOf<"item/load/success">();
		expectTypeOf(failAction.type).toEqualTypeOf<"item/load/fail">();
	});

	it("returns a given action creator as it is, with its own type", () => {
		const loaded = createAction<Item, "item/loaded">("item/loaded");
		const command = createJob("item/load", fetchItem, {
			success: loaded,
		});
		const { success: successAction } = command;

		expectTypeOf(successAction).toEqualTypeOf(loaded);
	});

	it("a plain object as a target is an error", () => {
		const wrongCalls = () => {
			createJob("item/load", fetchItem, {
				// @ts-expect-error a plain action object is not a target
				fail: { type: "item/failed" },
			});
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});

	it("makes pending and cancel with the defaults, the payload of the call and the abort reason", () => {
		const command = createJob("item/load", fetchItem);
		const { pending: pendingAction, cancel: cancelAction } = command;

		expectTypeOf(pendingAction.type).toEqualTypeOf<"item/load/pending">();
		expectTypeOf(cancelAction.type).toEqualTypeOf<"item/load/cancel">();
		expectTypeOf(pendingAction("1").payload).toEqualTypeOf<string>();
		expectTypeOf(cancelAction(new Error("x")).payload).toEqualTypeOf<unknown>();
	});

	it("makes pending and cancel from strings with the literal types", () => {
		const command = createJob("item/load", fetchItem, {
			pending: "item/loading",
			cancel: "item/cancelled",
		});

		expectTypeOf(command.pending.type).toEqualTypeOf<"item/loading">();
		expectTypeOf(command.cancel.type).toEqualTypeOf<"item/cancelled">();
	});

	it("returns a given creator for pending and cancel as it is", () => {
		const loading = createAction<string, "item/loading">("item/loading");
		const cancelled = createAction<unknown, "item/cancelled">("item/cancelled");
		const command = createJob("item/load", fetchItem, {
			pending: loading,
			cancel: cancelled,
		});

		expectTypeOf(command.pending).toEqualTypeOf(loading);
		expectTypeOf(command.cancel).toEqualTypeOf(cancelled);
	});

	it("a plain object as the target of pending or cancel is an error", () => {
		const wrongCalls = () => {
			createJob("item/load", fetchItem, {
				// @ts-expect-error a plain action object is not a target
				pending: { type: "item/loading" },
			});
			createJob("item/load", fetchItem, {
				// @ts-expect-error a plain action object is not a target
				cancel: { type: "item/cancelled" },
			});
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});
});

describe("signalPlugin", () => {
	const bus = createBus().use(signalPlugin());
	const getUser = createCommand("user/get", async (id: string) => ({ id }));
	const controller = new AbortController();

	it("takes a signal as the second argument of a call and returns the result", () => {
		const result = bus.emit(getUser("1"), { signal: controller.signal });

		expectTypeOf(result).toEqualTypeOf<Promise<{ id: string }>>();
	});

	it("takes a signal together with a scope", () => {
		const scoped = createBus<EventMap & WithContext<{ api?: string }>>().use(
			signalPlugin(),
		);
		const loaded = createCommand("user/loaded", (id: string) => id);

		scoped.emit(loaded("1"), { api: "fake", signal: controller.signal });
	});

	it("does not take it for the string form, and a signal must be a signal", () => {
		const wrongCalls = () => {
			// @ts-expect-error the string form has no options
			bus.emit("user/get", "1", { signal: controller.signal });
			// @ts-expect-error a signal is an AbortSignal
			bus.emit(getUser("1"), { signal: "stop" });
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});
});

describe("bus.use", () => {
	type Events = { greet: string };
	const bus = createBus<Events>();

	it("returns the type that the plugin returns", () => {
		const api = bus.use(() => ({ hello: () => "hi" }));
		expectTypeOf(api.hello()).toBeString();

		const off = bus.use((given) => given.on("greet", () => {}));
		expectTypeOf(off).toEqualTypeOf<UnsubscribeCallback>();
	});

	it("gives the plugin the bus with its events", () => {
		bus.use((given) => {
			given.on("greet", (name) => {
				expectTypeOf(name).toEqualTypeOf<string>();
			});
		});
	});

	it("a plugin that is not a function of the bus is an error", () => {
		const wrongCalls = () => {
			// @ts-expect-error a plugin is a function
			bus.use("not a plugin");
			// @ts-expect-error a plugin gets the bus, not a number
			bus.use((given: number) => given);
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});

	it("modulePlugin gives the api of the modules, with the events from them", () => {
		const user = createModule<Events>("user", () => {});
		const app = bus.use(modulePlugin([user]));

		expectTypeOf(app.mount(user)).toEqualTypeOf<UnsubscribeCallback>();
		expectTypeOf(app.isMounted(user)).toEqualTypeOf<boolean>();
		expectTypeOf(app.commands.handle).toBeFunction();
	});
});

describe("effectsPlugin", () => {
	type LoadEvents = { load: string };

	it("types race and all when destructured from the task", () => {
		const withEffects = createBus<LoadEvents>().use(
			effectsPlugin({ race, all }),
		);
		withEffects.on("load", async (id, { race, all }) => {
			expectTypeOf(id).toEqualTypeOf<string>();
			const raced = await race({ data: () => id, other: () => 1 });
			expectTypeOf(raced).toEqualTypeOf<{ data?: string; other?: number }>();
			const both = await all({ a: () => 1, b: () => "x" });
			expectTypeOf(both).toEqualTypeOf<{ a: number; b: string }>();
			const pair = await all([() => 1, () => "x"]);
			expectTypeOf(pair).toEqualTypeOf<[number, string]>();
		});
	});

	it("take knows the events of the bus and delay takes ms", () => {
		type Events = { load: string; saved: number };
		const withEffects = createBus<Events>().use(effectsPlugin({ take, delay }));
		withEffects.on("load", async (_, { take, delay }) => {
			expectTypeOf(await take("saved")).toEqualTypeOf<number>();
			expectTypeOf(delay).parameter(0).toEqualTypeOf<number | (() => number)>();
			// @ts-expect-error "missing" is not an event of this bus
			await take("missing");
		});
	});

	it("wrong arguments of a bound effect are errors", () => {
		const withEffects = createBus<LoadEvents>().use(effectsPlugin({ race }));
		withEffects.on("load", async (_, { race }) => {
			// @ts-expect-error race needs starters, not a number
			await race(1);
		});
	});

	it("a function that does not take a signal first is an error", () => {
		const format = (value: number) => String(value);
		// @ts-expect-error format has no `{ signal }` as its first parameter
		effectsPlugin({ format });
	});

	it("a plain user effect is typed without its first parameter", () => {
		const getJson = (ctx: { signal: AbortSignal }, url: string) =>
			Promise.resolve({ url, aborted: ctx.signal.aborted });
		const withEffects = createBus<LoadEvents>().use(effectsPlugin({ getJson }));
		withEffects.on("load", async (_, { getJson }) => {
			expectTypeOf(getJson).parameters.toEqualTypeOf<[url: string]>();
			expectTypeOf(await getJson("/a")).toEqualTypeOf<{
				url: string;
				aborted: boolean;
			}>();
			// @ts-expect-error the url is a string
			getJson(1);
		});
	});

	it("a plain generic effect loses its type parameter", () => {
		const first = <T>(_ctx: { signal: AbortSignal }, items: T[]): T =>
			items[0] as T;
		const withEffects = createBus<LoadEvents>().use(effectsPlugin({ first }));
		withEffects.on("load", (_, { first }) => {
			expectTypeOf(first(["a"])).toBeUnknown();
		});
	});

	it("Effect<F> keeps the type parameter, next to a plain effect", () => {
		type First = <T>(items: T[]) => T;
		const first: Effect<First> = (_ctx, items) => items[0];
		const getJson = (_ctx: { signal: AbortSignal }, url: string) =>
			Promise.resolve(url);
		const withEffects = createBus<LoadEvents>().use(
			effectsPlugin({ first, getJson }),
		);
		withEffects.on("load", async (_, { first, getJson }) => {
			expectTypeOf(first(["a"])).toBeString();
			expectTypeOf(first([1])).toBeNumber();
			expectTypeOf(await getJson("/a")).toBeString();
		});
	});

	it("a user function named like a built-in is not typed as the built-in", () => {
		const delay = (_ctx: { signal: AbortSignal }, label: string) => label;
		const withEffects = createBus<LoadEvents>().use(effectsPlugin({ delay }));
		withEffects.on("load", (_, { delay }) => {
			expectTypeOf(delay).parameters.toEqualTypeOf<[label: string]>();
		});
	});

	it("an effect that is already a context field is an error", () => {
		const taken = createBus<LoadEvents & WithContext<{ race: number }>>();
		// @ts-expect-error race is a context field of this bus already
		taken.use(effectsPlugin({ race }));
		const once = createBus<LoadEvents>().use(effectsPlugin({ race }));
		// @ts-expect-error race was added by the first plugin
		once.use(effectsPlugin({ race }));
		once.use(effectsPlugin({ all }));
	});

	it("keeps the fields of an existing WithContext", () => {
		type Store = { readonly name: string };
		const withStore = createBus<LoadEvents & WithContext<{ store: Store }>>({
			context: { store: { name: "main" } },
		}).use(effectsPlugin({ all }));
		withStore.on("load", async (_, { store, all }) => {
			expectTypeOf(store).toEqualTypeOf<Store>();
			expectTypeOf(await all({ a: () => 1 })).toEqualTypeOf<{ a: number }>();
		});
	});
});

describe("emitterPlugin", () => {
	type NameEvents = { "name/changed": string };

	it("a creator without a payload type takes the payload of the event map", () => {
		const withEmitter = createBus<NameEvents>().use(emitterPlugin());
		const nameChanged = createAction("name/changed");
		const emitNameChanged = withEmitter.emitter(nameChanged);

		expectTypeOf(emitNameChanged).parameters.toEqualTypeOf<[payload: string]>();
		// @ts-expect-error the event map says a string
		emitNameChanged(1);
	});

	it("a creator with a payload type takes that payload", () => {
		const withEmitter = createBus().use(emitterPlugin());
		const emitAdded = withEmitter.emitter(
			createAction<number>("counter/added"),
		);

		expectTypeOf(emitAdded).parameters.toEqualTypeOf<[payload: number]>();
		// @ts-expect-error a number is expected
		emitAdded("1");
	});

	it("takes the arguments of a prepare function", () => {
		const withEmitter = createBus().use(emitterPlugin());
		const renamed = createAction(
			"user/renamed",
			(id: string, name: string) => ({ payload: { id, name } }),
		);

		expectTypeOf(withEmitter.emitter(renamed)).parameters.toEqualTypeOf<
			[id: string, name: string]
		>();
	});

	it("bus.emit takes a creator and a payload", () => {
		const withEmitter = createBus<NameEvents>().use(emitterPlugin());
		const nameChanged = createAction("name/changed");

		withEmitter.emit(nameChanged, "Eva");
		// @ts-expect-error the event map says a string
		withEmitter.emit(nameChanged, 1);
	});
});

describe("types of a bus in other files", () => {
	type Store = { read(id: string): string };
	type LoadEvents = { loaded: string } & WithContext<{ store: Store }>;

	const appBus = createBus<LoadEvents>({
		context: { store: { read: (id) => id } },
	}).use(effectsPlugin({ race }));
	type AppEvents = EventsOf<typeof appBus>;

	it("EventsOf keeps the context fields of the plugins", () => {
		expectTypeOf<AppEvents["loaded"]>().toEqualTypeOf<string>();
		expectTypeOf<Context<AppEvents>["store"]>().toEqualTypeOf<Store>();
		expectTypeOf<Context<AppEvents>["race"]>().toBeFunction();
	});

	it("EventsOf of something that is not a bus is never", () => {
		expectTypeOf<EventsOf<string>>().toBeNever();
	});

	it("a task with the context of the app gives a command that sees the fields", () => {
		const read: Task<string, AppEvents, string> = (id, ctx) =>
			ctx.store.read(id);
		const readItem = createCommand("item/read", read);
		const module = createModule<AppEvents>("items", (items) => {
			items.handle(readItem, read);
			items.on("loaded", (_, ctx) => {
				expectTypeOf(ctx.store).toEqualTypeOf<Store>();
			});
		});
		expectTypeOf(module.name).toBeString();
		expectTypeOf(appBus.emit(readItem("1"))).toEqualTypeOf<string>();
	});

	it("a command made without the app context sees an empty context", () => {
		createCommand("item/plain", (_: string, ctx) => {
			// @ts-expect-error the plain context has no `store`
			void ctx.store;
		});
	});

	it("app.createModule gives the module the fields of the bus without a type argument", () => {
		const getItem = createCommand<string, Promise<string>>("item/get");
		const app = appBus.use(modulePlugin());
		const module = app.createModule("items", (items) => {
			items.on("loaded", (_, ctx) => {
				expectTypeOf(ctx.store).toEqualTypeOf<Store>();
				expectTypeOf(ctx.race).toBeFunction();
				// @ts-expect-error the bus has no such field
				void ctx.nothing;
			});
			items.handle(getItem, async (id, ctx) => {
				expectTypeOf(id).toEqualTypeOf<string>();
				return ctx.store.read(id);
			});
			// @ts-expect-error the command promises a string
			items.handle(getItem, async () => 1);
		});
		expectTypeOf(app.mount(module)).toEqualTypeOf<UnsubscribeCallback>();
	});
});

describe("contextPlugin", () => {
	type Store = { read(id: string): string };
	type Logger = { log(message: string): void };
	type UserEvents = { "user/loaded": User };
	const store: Store = { read: (id) => id };
	const logger: Logger = { log: () => {} };

	it("infers the fields from the value and keeps the payloads of the event map", () => {
		const bus = createBus<UserEvents>().use(contextPlugin({ store }));
		bus.on("user/loaded", (user, ctx) => {
			expectTypeOf(user).toEqualTypeOf<User>();
			expectTypeOf(ctx.store).toEqualTypeOf<Store>();
			// @ts-expect-error the bus has no such field
			void ctx.nothing;
		});
	});

	it("infers the fields on a bus without an event map", () => {
		const bus = createBus().use(contextPlugin({ store }));
		bus.on("anything", (_, ctx) => {
			expectTypeOf(ctx.store).toEqualTypeOf<Store>();
		});
	});

	it("infers the fields from a function of the task", () => {
		const bus = createBus<UserEvents>().use(
			contextPlugin((task) => ({ scope: task.type })),
		);
		bus.on("user/loaded", (_, ctx) => {
			expectTypeOf(ctx.scope).toEqualTypeOf<string>();
		});
	});

	it("merges with other plugins, in either order, and with WithContext", () => {
		type Events = UserEvents & WithContext<{ store: Store }>;
		const first = createBus<Events>()
			.use(contextPlugin({ logger }))
			.use(effectsPlugin({ race }));
		first.on("user/loaded", (_, ctx) => {
			expectTypeOf(ctx.store).toEqualTypeOf<Store>();
			expectTypeOf(ctx.logger).toEqualTypeOf<Logger>();
			expectTypeOf(ctx.race).toBeFunction();
		});

		const second = createBus<UserEvents>()
			.use(effectsPlugin({ race }))
			.use(contextPlugin({ store }))
			.use(contextPlugin({ logger }));
		second.on("user/loaded", (_, ctx) => {
			expectTypeOf(ctx.race).toBeFunction();
			expectTypeOf(ctx.store).toEqualTypeOf<Store>();
			expectTypeOf(ctx.logger).toEqualTypeOf<Logger>();
		});
	});

	it("EventsOf includes the fields of the plugin", () => {
		const bus = createBus<UserEvents>().use(contextPlugin({ store }));
		type AppEvents = EventsOf<typeof bus>;
		expectTypeOf<AppEvents["user/loaded"]>().toEqualTypeOf<User>();
		expectTypeOf<Context<AppEvents>["store"]>().toEqualTypeOf<Store>();
	});

	it("rejects a name that the bus has already", () => {
		type Events = UserEvents & WithContext<{ store: Store }>;
		const withStore = createBus<Events>();
		// @ts-expect-error `store` is a field of the bus already
		withStore.use(contextPlugin({ store }));

		const twice = createBus<UserEvents>().use(contextPlugin({ store }));
		// @ts-expect-error the earlier plugin gave `store`
		twice.use(contextPlugin({ store }));
	});

	it("leaves the old form as it was", () => {
		type Events = UserEvents & WithContext<{ store: Store }>;
		const bus = createBus<Events>({ context: { store } });
		expectTypeOf(bus).toEqualTypeOf<ReturnType<typeof createBus<Events>>>();
		bus.on("user/loaded", (_, ctx) => {
			expectTypeOf(ctx.store).toEqualTypeOf<Store>();
		});
	});
});

describe("createEffectsMiddleware", () => {
	type State = { count: number };
	type Events = { "user/requested": string } & WithContext<{
		store: ReduxStoreApi<State>;
	}>;

	it("takes a bus, and ctx.store is typed by WithContext on its event map", () => {
		const bus = createBus<Events>();
		const middleware = createEffectsMiddleware(bus, {
			filter: (action) => action.type !== "internal/tick",
		});
		expectTypeOf(middleware).toBeFunction();
		bus.on("user/requested", (_id, { store }) => {
			expectTypeOf(store.getState()).toEqualTypeOf<State>();
		});
	});

	it("rejects the old call shapes", () => {
		const bus = createBus<Events>();
		// the calls are type errors and would throw, so they are never run
		const wrongCalls = () => {
			// @ts-expect-error the bus is the first argument
			createEffectsMiddleware();
			// @ts-expect-error the options of the bus belong to createBus
			createEffectsMiddleware(bus, { onError: () => {} });
			// @ts-expect-error the old form passed options only
			createEffectsMiddleware({ filter: () => true });
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});
});

describe("reactPlugin", () => {
	type ProfileEvents = {
		"name/changed": string;
		"profile/changed": { name: string };
	};

	it("adds useEmitter and types the value from the event", () => {
		const bus = createBus<ProfileEvents>().use(reactPlugin());
		const nameChanged = createAction<string>("name/changed");

		expectTypeOf(bus.useEmitter).toBeFunction();
		const calls = () => {
			bus.useEmitter("name/changed", "Adam");
			bus.useEmitter(nameChanged, "Adam");
			bus.useEmitter(
				"profile/changed",
				{ name: "Adam" },
				{ equals: (previous, next) => previous.name === next.name },
			);
			bus.useEmitter("name/changed", "Adam", {
				traceId: "Profile",
				traceGroupId: "checkout",
			});
		};
		expectTypeOf(calls).toBeFunction();
	});

	it("rejects a value of another type and a wrong comparison", () => {
		const bus = createBus<ProfileEvents>().use(reactPlugin());
		const nameChanged = createAction<string>("name/changed");
		const wrongCalls = () => {
			// @ts-expect-error the payload of name/changed is a string
			bus.useEmitter("name/changed", 1);
			// @ts-expect-error the creator takes a string
			bus.useEmitter(nameChanged, 1);
			// @ts-expect-error the comparison gets values of the payload type
			bus.useEmitter("name/changed", "Adam", {
				equals: (previous: number) => previous > 0,
			});
			// @ts-expect-error the third argument is an options object, not a function
			bus.useEmitter("name/changed", "Adam", (a: string, b: string) => a === b);
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});
});

describe("scope", () => {
	type Http = { readonly kind: "http" };
	type FeedHttp = { readonly kind: "feed" };
	type Cache = { get(key: string): string };
	const cache: Cache = { get: (key) => key };
	const getJson = (_ctx: { signal: AbortSignal }, url: string) =>
		Promise.resolve(url);

	it("a command handler sees the fields of its scope, before ctx is typed", () => {
		const first = effect(
			<T>(_ctx: { signal: AbortSignal }, items: T[]): T | undefined => items[0],
		);
		const getUser = createCommand(
			"user/get",
			async (id: string, ctx) => {
				expectTypeOf(ctx.cache).toEqualTypeOf<Cache>();
				expectTypeOf(await ctx.getJson("/a")).toBeString();
				expectTypeOf(ctx.first(["a"])).toEqualTypeOf<string | undefined>();
				expectTypeOf(ctx.first([1])).toEqualTypeOf<number | undefined>();
				expectTypeOf(ctx.race).toBeFunction();
				expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>();
				return id;
			},
			{ cache, first, $effects: { getJson, race } },
		);
		expectTypeOf(getUser).parameter(0).toBeString();
	});

	it("a scope with only effects, or only context, infers too", () => {
		createCommand(
			"a",
			(_: undefined, ctx) => {
				expectTypeOf(ctx.getJson).parameters.toEqualTypeOf<[url: string]>();
			},
			{ $effects: { getJson } },
		);
		createCommand(
			"b",
			(_: undefined, ctx) => {
				expectTypeOf(ctx.cache).toEqualTypeOf<Cache>();
			},
			{ cache },
		);
	});

	it("a command without a scope is typed as before", () => {
		const plain = createCommand("plain", (id: string) => id.length);
		expectTypeOf(plain).parameter(0).toBeString();
		expectTypeOf(createBus<Events>().emit(plain, "a")).toBeNumber();
	});

	it("a scope field replaces a field of the bus in the type", () => {
		type Fields = { http: Http; store: { name: string } };
		type Mapped = { load: string } & WithContext<Fields>;
		const bus = createBus<Mapped>({
			context: { http: { kind: "http" }, store: { name: "main" } },
		});
		const feed = createModule<Mapped, { http: FeedHttp }>(
			"feed",
			(moduleContext) => {
				moduleContext.on("load", (_id, ctx) => {
					expectTypeOf(ctx.http).toEqualTypeOf<FeedHttp>();
					expectTypeOf(ctx.store).toEqualTypeOf<{ name: string }>();
				});
			},
			{ http: { kind: "feed" } },
		);
		bus.use(modulePlugin([feed]));
	});

	it("the listeners of an action with a scope see its fields", () => {
		const bus = createBus<{ "user/loaded": User }>();
		const loaded = createAction("user/loaded", { cache });
		bus.on(loaded, (user, ctx) => {
			expectTypeOf(user).toEqualTypeOf<User>();
			expectTypeOf(ctx.cache).toEqualTypeOf<Cache>();
		});
		const typed = createAction<User, "user/typed", { cache: Cache }>(
			"user/typed",
			{ cache },
		);
		bus.on(typed, (_user, ctx) => {
			expectTypeOf(ctx).not.toHaveProperty("nothing");
		});
	});

	it("a job takes the scope after its outcomes", () => {
		createJob(
			"user/load",
			async (id: string, ctx) => {
				expectTypeOf(ctx.cache).toEqualTypeOf<Cache>();
				expectTypeOf(await ctx.getJson("/a")).toBeString();
				return id;
			},
			{},
			{ cache, $effects: { getJson } },
		);
	});

	it("an override in emit is checked against the type of the field", () => {
		const bus = createBus<Events>();
		const getUser = createCommand(
			"user/get",
			(_id: string, { cache }) => cache,
			{ cache },
		);
		const other: Cache = { get: () => "other" };
		bus.emit(getUser("1"), { cache: other });
		// @ts-expect-error cache is a Cache, not a number
		bus.emit(getUser("1"), { cache: 1 });
		// @ts-expect-error the effects of a call are functions that take a signal first
		bus.emit(getUser("1"), { $effects: { format: (value: number) => value } });
	});

	it("a field that neither the bus nor the command declares is an error", () => {
		const bus = createBus<Events>();
		const plain = createCommand("plain", () => 1);
		// @ts-expect-error nothing declares `unknown`, so there is no type to hold it to
		bus.emit(plain(), { unknown: 1 });
		bus.emit(plain(), { $effects: { delay } });
	});

	it("a scope is flat: its keys are fields, and only $effects is special", () => {
		createCommand(
			"flat",
			(_: string, ctx) => {
				expectTypeOf(ctx.cache).toEqualTypeOf<Cache>();
				expectTypeOf(ctx.delay).toBeFunction();
				// @ts-expect-error `$effects` is not a field of the context: its entries are
				ctx.$effects;
			},
			{ cache, $effects: { delay } },
		);
	});

	it("a key named effects is an ordinary field of the context", () => {
		createCommand(
			"plain-effects",
			(_: string, ctx) => {
				expectTypeOf(ctx.effects).toEqualTypeOf<{ retries: number }>();
			},
			{ effects: { retries: 3 } },
		);
	});

	it("the string form of emit takes no scope", () => {
		const bus = createBus<Events>();
		// @ts-expect-error a scope goes with an action or a command call
		bus.emit("user/loaded", { id: "1", name: "a" }, {});
	});

	it("an effect needs { signal } as its first parameter", () => {
		const format = (value: number) => String(value);
		createCommand("x", () => 1, {
			// @ts-expect-error format does not take a signal first
			$effects: { format },
		});
		// @ts-expect-error effect wants a function that takes a signal first
		effect(format);
	});
});

describe("matchPlugin", () => {
	type Shop = {
		"user/loaded": User;
		"user/failed": string;
		"order/placed": number;
	};
	const bus = createBus<Shop>().use(matchPlugin());

	it("keeps the inference of an event name, a creator and a command", () => {
		bus.on("order/placed", (count, ctx) => {
			expectTypeOf(count).toEqualTypeOf<number>();
			expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>();
		});
		const placed = createAction("order/placed");
		bus.on(placed, (count) => {
			expectTypeOf(count).toEqualTypeOf<number>();
		});
		const double = createCommand("math/double", (value: number) => value * 2);
		bus.on(double, (value) => {
			expectTypeOf(value).toEqualTypeOf<number>();
		});
		// @ts-expect-error "missing" is not an event of this bus
		bus.on("missing", () => {});
	});

	it("a type guard narrows the payload of the handler", () => {
		const isLoaded = (action: {
			type: string;
			payload: unknown;
		}): action is { type: "user/loaded"; payload: User } =>
			action.type === "user/loaded";
		bus.on(isLoaded, (user) => {
			expectTypeOf(user).toEqualTypeOf<User>();
		});
		bus.once(isLoaded, (user) => {
			expectTypeOf(user).toEqualTypeOf<User>();
		});
	});

	it("a predicate that is not a guard gives the payloads of all the events", () => {
		bus.on(
			(action) => action.type.startsWith("user/"),
			(payload) => {
				expectTypeOf(payload).toEqualTypeOf<User | string | number>();
			},
		);
	});

	it("off takes the predicate and the handler", () => {
		const predicate = (action: { type: string }) =>
			action.type === "user/failed";
		const handler = (payload: User | string | number) => {
			void payload;
		};
		bus.on(predicate, handler);
		bus.off(predicate, handler);
		bus.off(predicate);
		bus.off("order/placed");
		bus.off();
	});

	it("a bus without the plugin does not take a predicate", () => {
		const plain = createBus<Shop>();
		const isPlaced = (action: { type: string }) =>
			action.type === "order/placed";
		// @ts-expect-error only matchPlugin lets on take a predicate
		plain.on(isPlaced, () => {});
	});
});

describe("the class entry: extendBus", () => {
	type Events = { "order/placed": { id: string; total: number } };

	class Base {
		name: string;
		constructor(name: string) {
			this.name = name;
		}
		describe() {
			return this.name;
		}
	}

	it("types the instance as the base plus the methods of the bus", () => {
		const bus = createBus<Events>();
		const Service = extendBus(bus, Base);
		const service = new Service("a");

		expectTypeOf(service).toExtend<Base>();
		expectTypeOf(service.describe).returns.toBeString();
		expectTypeOf(service.dispose).toEqualTypeOf<() => void>();
		expectTypeOf(service.bus).toEqualTypeOf(bus);
		service.on("order/placed", (order) => {
			expectTypeOf(order).toEqualTypeOf<{ id: string; total: number }>();
		});
		service.emit("order/placed", { id: "o1", total: 2 });
		// @ts-expect-error the payload does not match the event
		service.emit("order/placed", 1);
		// @ts-expect-error an event that the bus does not know
		service.on("unknown", () => {});
	});

	it("keeps the parameters of the constructor", () => {
		const Service = extendBus(createBus<Events>(), Base);

		// @ts-expect-error the constructor needs a name
		new Service();
		new Service("a");
	});

	it("has the methods of the plugins that the bus has", () => {
		const bus = createBus<Events>().use(emitterPlugin());
		const service = new (extendBus(bus, Base))("a");

		expectTypeOf(service.emitter).toBeFunction();
		// @ts-expect-error a bus without the plugin has no such method
		new (extendBus(createBus<Events>(), Base))("a").emitter;
	});

	it("keeps the type of a member that the class has", () => {
		class Own {
			emit(text: string): string {
				return text;
			}
		}
		const service = new (extendBus(createBus<Events>(), Own))();

		expectTypeOf(service.emit).toEqualTypeOf<(text: string) => string>();
	});

	it("makes a bus for the class when none is given", () => {
		const Service = extendBus(Base);

		expectTypeOf(Service.bus.emit).toBeFunction();
		new Service("a").on("anything", () => {});
	});

	it("lets a decorated class declare what it gets", () => {
		const bus = createBus<Events>();
		// the merge the docs show for a decorated class: TypeScript does not change its type
		// biome-ignore lint/correctness/noUnusedVariables: it is read through the class below
		interface Declared extends BusMethods<typeof bus> {}
		// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: the pattern under test
		class Declared {}

		expectTypeOf<Declared["dispose"]>().toEqualTypeOf<() => void>();
		expectTypeOf<Declared["emit"]>().toEqualTypeOf(bus.emit);
	});

	it("checks the payload of a decorated method against the event", () => {
		const placed = createAction<{ id: string }>("order/placed");
		const decorate = On(placed);
		const context = Reflect.get({}, "none");

		decorate((_payload: { id: string }) => {}, context);
		// @ts-expect-error the method takes a different payload
		decorate((_payload: number) => {}, context);
		// a string event does not know the payload
		On("anything")((_payload: number) => {}, context);
	});
});

describe("withPolicy", () => {
	it("infers the payload and the result of the callback", () => {
		const search = withPolicy(debounce(300, (query: string) => query.length));

		expectTypeOf(search).parameter(0).toEqualTypeOf<string>();
		expectTypeOf(search).returns.toEqualTypeOf<Promise<number | undefined>>();
	});

	it("calls a void payload with no argument", async () => {
		const refresh = withPolicy(latest((_: undefined) => 1));

		await refresh();
		expectTypeOf(refresh).parameters.toEqualTypeOf<[payload?: undefined]>();
	});

	it("has cancel", () => {
		const search = withPolicy(debounce(300, (query: string) => query));

		expectTypeOf(search.cancel).toBeFunction();
		expectTypeOf(search.cancel).parameters.toEqualTypeOf<[reason?: unknown]>();
	});

	it("a wrong payload is an error", () => {
		const search = withPolicy(debounce(300, (query: string) => query));
		const wrongCalls = () => {
			// @ts-expect-error the payload is a string
			search(1);
			// @ts-expect-error the payload is not optional
			search();
		};
		expectTypeOf(wrongCalls).toBeFunction();
	});
});

describe("usePolicy", () => {
	// a hook only runs inside a component: these checks never call it
	it("infers the payload and the result from the callback", () => {
		const useSearch = () =>
			usePolicy(
				(query: string) => query.length,
				(task) => debounce(300, task),
			);

		expectTypeOf(useSearch).returns.parameter(0).toEqualTypeOf<string>();
		expectTypeOf(useSearch).returns.returns.toEqualTypeOf<
			Promise<number | undefined>
		>();
	});

	it("gives make a task of the payload of the callback", () => {
		const useSearch = () =>
			usePolicy(
				(query: string) => query,
				(task) => {
					expectTypeOf(task).parameter(0).toEqualTypeOf<string>();
					return latest(task);
				},
				[],
			);

		expectTypeOf(useSearch).returns.toHaveProperty("cancel");
	});

	it("a wrong payload is an error", () => {
		const useSearch = () =>
			usePolicy(
				(query: string) => query,
				(task) => debounce(300, task),
			);
		const wrongCall = () => {
			const search = useSearch();
			// @ts-expect-error the payload is a string
			search(1);
		};
		expectTypeOf(wrongCall).toBeFunction();
	});
});
