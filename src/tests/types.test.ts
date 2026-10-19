// What a user sees from the type checker: payloads and contexts are inferred
// without writing generics, and wrong calls are errors. Nothing here runs
// anything that matters; `pnpm tsgo` is the test.
import { describe, expectTypeOf, it } from "vitest";
import {
	createAction,
	createCommand,
	createCommands,
	createJob,
	createModule,
	modulePlugin,
} from "../actions";
import { type Context, createBus, type WithContext } from "../core/bus";
import type { UnsubscribeCallback } from "../core/types";
import {
	all,
	allSettled,
	cancellable,
	poll,
	race,
	retry,
	take,
	timeout,
} from "../effects";
import { debounce, latest, leading, queue, throttle } from "../policies";

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
		const { command: loadUser } = createJob(
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

	it("createCommands(bus) takes the events from the bus and binds handlers", () => {
		const bus = createBus<Events>();
		const commands = createCommands(bus);
		const unbind = commands.handle(getUser, async (id, ctx) => {
			expectTypeOf(id).toEqualTypeOf<string>();
			expectTypeOf(ctx).toEqualTypeOf<Context<Events>>();
			return { id, name: "a" };
		});
		expectTypeOf(unbind).toEqualTypeOf<UnsubscribeCallback>();
		expectTypeOf(bus.emit(getUser, "1")).resolves.toEqualTypeOf<User>();
	});

	it("the constructor has no commands option", () => {
		const wrongCalls = () => {
			const other = createBus<Events>();
			// @ts-expect-error commands are attached with createCommands(bus)
			createBus<Events>({ commands: createCommands(other) });
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
		const { command, successAction, failAction } = createJob(
			"item/load",
			fetchItem,
			{
				success: "item/loaded",
				fail: "item/failed",
			},
		);

		expectTypeOf(command.type).toEqualTypeOf<"item/load">();
		expectTypeOf(successAction.type).toEqualTypeOf<"item/loaded">();
		expectTypeOf(failAction.type).toEqualTypeOf<"item/failed">();
		expectTypeOf(successAction({ id: 1 }).payload).toEqualTypeOf<Item>();
		expectTypeOf(failAction(new Error("x")).payload).toEqualTypeOf<unknown>();
	});

	it("makes the missing actions with the types <type>/success and <type>/fail", () => {
		const { successAction, failAction } = createJob("item/load", fetchItem);

		expectTypeOf(successAction.type).toEqualTypeOf<"item/load/success">();
		expectTypeOf(failAction.type).toEqualTypeOf<"item/load/fail">();
	});

	it("returns a given action creator as it is, with its own type", () => {
		const loaded = createAction<Item, "item/loaded">("item/loaded");
		const { successAction } = createJob("item/load", fetchItem, {
			success: loaded,
		});

		expectTypeOf(successAction).toEqualTypeOf(loaded);
	});

	it("a command or a plain object as a target is an error", () => {
		const wrongCalls = () => {
			const show = createCommand("ui/show", (_: Item) => {});
			// @ts-expect-error a target is a string or an action creator
			createJob("item/load", fetchItem, { success: show });
			// @ts-expect-error a plain action object is not a target either
			createJob("item/load", fetchItem, { fail: { type: "item/failed" } });
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
