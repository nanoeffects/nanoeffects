// The code of docs/guide.md, step by step. Each step is a function that returns what it saw,
// so the guide is type-checked and run by `src/tests/guide.test.ts`.
import { createBus } from "nanoeffects";
import {
	createAction,
	createCommand,
	createCommands,
	createModule,
	registerModules,
} from "nanoeffects/actions";
import { all, retry, take, timeout } from "nanoeffects/effects";
import { debounce, latest, queue, throttle } from "nanoeffects/policies";

type Item = { id: number };
type User = { id: string; name: string };
declare const api: {
	search(query: string, options: { signal: AbortSignal }): Promise<Item[]>;
	save(draft: string, options: { signal: AbortSignal }): Promise<void>;
	user(id: string, options: { signal: AbortSignal }): Promise<User>;
	posts(id: string, options: { signal: AbortSignal }): Promise<string[]>;
};

// 1. A bus: subscribe, emit, unsubscribe
export const step1 = () => {
	const seen: string[] = [];
	const bus = createBus();

	const unbind = bus.on("greet", (name) => {
		seen.push(`hello ${name}`);
	});
	bus.emit("greet", "Ada"); // hello Ada
	unbind();
	bus.emit("greet", "Bob"); // nobody listens now

	return seen;
};

// 2. Types: describe the events once
type Events = {
	greet: string;
	moved: { x: number; y: number };
	reset: undefined; // an event without data
	outOfBounds: { x: number; y: number };
	search: string;
	results: Item[];
	scroll: number;
	typed: string;
	save: string;
};

export const step2 = () => {
	const seen: number[] = [];
	const bus = createBus<Events>();

	bus.on("moved", ({ x, y }) => {
		seen.push(x + y);
	});
	bus.emit("moved", { x: 1, y: 2 });
	bus.emit("reset"); // no payload to give
	// bus.emit("moved", { x: "1" });  // error: x is a number
	// bus.emit("jumped", 1);          // error: there is no such event

	return seen;
};

// 3. The second argument of a handler is its context: a handler can emit events too
export const step3 = () => {
	const seen: string[] = [];
	const bus = createBus<Events>();

	bus.on("moved", ({ x, y }, ctx) => {
		if (x < 0) {
			ctx.emit("outOfBounds", { x, y });
		}
	});
	bus.on("outOfBounds", ({ x }) => {
		seen.push(`out at ${x}`);
	});
	bus.emit("moved", { x: -1, y: 0 });

	return seen;
};

// 4. Three ways to name an event: a string, an object { type, payload }, a function with a `type`
const moved = createAction("moved"); // the payload type comes from the event map
const double = createCommand("math/double", (value: number) => value * 2);

export const step4 = () => {
	const seen: unknown[] = [];
	const bus = createBus<Events>();

	bus.on("moved", ({ x }) => {
		seen.push(`string ${x}`);
	});
	bus.on(moved, ({ x }) => {
		seen.push(`action ${x}`); // the same event, named by its action creator
	});

	bus.emit("moved", { x: 1, y: 2 }); // a string, and the payload next to it
	bus.emit({ type: "moved", payload: { x: 2, y: 2 } }); // an object, as a Redux action is
	bus.emit(moved({ x: 3, y: 2 })); // what an action creator makes is such an object
	seen.push(bus.emit(double, 21)); // a function with a `type`: a command, it runs and returns its result

	return seen;
};

// 5. A command is a request with a result; for `emit` to run it, its handler is registered
const getUser = createCommand<string, Promise<User>>("user/get"); // only the contract: no handler yet

export const step5 = async () => {
	const seen: string[] = [];
	const commands = createCommands<Events>(); // the handlers of this bus
	const bus = createBus<Events>({ commands });

	try {
		bus.emit(getUser, "1"); // nobody handles it: an error says so
	} catch (error) {
		seen.push((error as Error).message);
	}

	const unregister = commands.handle(getUser, async (id) => ({
		id,
		name: `user ${id}`,
	}));
	const user = await bus.emit(getUser, "1"); // the result of the handler
	seen.push(user.name);

	unregister(); // the handler is gone: the command has none again
	try {
		bus.emit(getUser, "1");
	} catch (error) {
		seen.push((error as Error).message);
	}

	return seen;
};

// 6. The first policy: `latest` goes straight into `on`
export const step6 = () => {
	const bus = createBus<Events>();

	// a newer search aborts the older one; `signal` is how the request learns about it
	bus.on(
		"search",
		latest(async (query, { signal }) => {
			await api.search(query, { signal });
		}),
	);

	return bus;
};

// 7. More policies, and even a plain function works
export const step7 = () => {
	const bus = createBus<Events>();

	bus.on(
		"scroll",
		throttle(100, (position) => void position),
	); // at most once per 100 ms
	bus.on(
		"typed",
		debounce(300, (text) => void text),
	); // after 300 ms of quiet
	bus.on(
		"save",
		queue(async (draft, { signal }) => api.save(draft, { signal })),
	); // in order

	// they nest: wait for quiet, then keep only the latest
	bus.on(
		"search",
		debounce(
			300,
			latest(async (query) => void query),
		),
	);

	return bus;
};

// 8. The first effects: retry and timeout wrap a handler, like a policy
const searchTask = (query: string, { signal }: { signal: AbortSignal }) =>
	api.search(query, { signal });

export const step8 = () => {
	const bus = createBus<Events>();

	// 5 seconds for each try, up to 3 tries, and a newer query supersedes the whole thing
	bus.on("typed", latest(retry(timeout(5000, searchTask), { times: 3 })));

	// to use the result in a handler, `ctx.run` runs the wrapped Task as a child
	bus.on(
		"search",
		latest(async (query, ctx) => {
			const items = await ctx.run(
				retry(timeout(5000, searchTask), { times: 3 }),
				query,
			);
			ctx.emit("results", items);
		}),
	);

	// one call in the middle of a body: `ctx` first
	bus.on("scroll", async (_position, ctx) => {
		const items = await retry(ctx, () =>
			api.search("more", { signal: ctx.signal }),
		);
		void items;
	});

	return bus;
};

// 9. Several things at once, and waiting for another event
export const step9 = async () => {
	const seen: string[] = [];
	const bus = createBus<Events>();

	bus.on("search", async (id, ctx) => {
		const { user, posts } = await all(ctx, {
			user: ({ signal }) => api.user(id, { signal }),
			posts: ({ signal }) => api.posts(id, { signal }),
		});
		void [user.name, posts.length];
	});
	bus.on("typed", async (query, ctx) => {
		const position = await take(ctx, "scroll"); // resolves with the next scroll
		seen.push(`${query} at ${position}`);
	});
	bus.emit("typed", "nano");
	bus.emit("scroll", 40);
	await new Promise((resolve) => setTimeout(resolve, 0)); // let the handler finish

	return seen;
};

// 10. Modules: what a domain of the app does, together, and undoable; commands too
export const step10 = () => {
	const seen: unknown[] = [];
	const bus = createBus<Events>();
	const greeting = createModule<Events>("greeting", (m) => {
		m.on("greet", (name) => {
			seen.push(`hello ${name}`);
		});
		m.handle(getUser, async (id) => ({ id, name: "from the module" })); // registered for the module
	});

	const app = registerModules(bus, [greeting]);
	bus.emit("greet", "Ada");
	seen.push(bus.emit(getUser, "1") instanceof Promise);
	app.unmount(greeting); // everything the module did is undone
	bus.emit("greet", "Bob");

	return seen;
};

// 11. Errors and typos
export const step11 = () => {
	const problems: string[] = [];
	const bus = createBus<Events>({
		onError: (error) => {
			problems.push(`error: ${(error as Error).message}`);
		},
		onUnhandled: ({ type }) => {
			problems.push(`nobody listens to ${type}`);
		},
	});

	bus.on("greet", () => {
		throw new Error("boom");
	});
	bus.emit("greet", "Ada"); // the error goes to onError, the other handlers still run
	bus.emit("reset"); // a typo, or a handler that was never added

	return problems;
};
