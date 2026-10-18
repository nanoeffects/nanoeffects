// What a user sees from the type checker: payloads and contexts are inferred
// without writing generics, and wrong calls are errors. Nothing here runs
// anything that matters; `pnpm tsgo` is the test.
import { describe, expectTypeOf, it } from "vitest";
import { createAction, createCommand, createJob } from "../actions";
import { type Context, createBus } from "../core/bus";
import type { UnsubscribeCallback } from "../core/types";
import { all, allSettled, poll, race, retry, take, timeout } from "../effects";
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
		const loadUser = createJob(
			"user/load",
			async (id: string) => ({ id, name: "a" }),
			{ done: loaded },
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
