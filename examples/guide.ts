// The code of docs/guide.md, step by step. Each step is a function that returns what it saw,
// so the guide is type-checked and run by `src/tests/guide.test.ts`.
import { createBus } from "nanoeffects";
import {
	commandsPlugin,
	createAction,
	createCommand,
	createModule,
	modulePlugin,
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

type Events = {
	greet: string;
	moved: { x: number; y: number };
	reset: undefined;
	outOfBounds: { x: number; y: number };
	search: string;
	results: Item[];
	scroll: number;
	typed: string;
	save: string;
};

// 1. A bus: subscribe, emit, unsubscribe
export const step1 = () => {
	const seen: string[] = [];
	const bus = createBus();

	const unbind = bus.on("greet", (name) => {
		seen.push(`hello ${name}`);
	});
	bus.emit("greet", "Ada");
	unbind();
	bus.emit("greet", "Bob");

	return seen;
};

// 2. The second argument of a handler is its context
export const step2 = () => {
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

// 3. The first policy: `latest` goes straight into `on`
export const step3 = () => {
	const bus = createBus<Events>();

	bus.on(
		"search",
		latest(async (query, { signal }) => {
			await api.search(query, { signal });
		}),
	);

	return bus;
};

// 4. More policies, and they nest
export const step4 = () => {
	const bus = createBus<Events>();

	bus.on(
		"scroll",
		throttle(100, (position) => void position),
	);
	bus.on(
		"typed",
		debounce(300, (text) => void text),
	);
	bus.on(
		"save",
		queue(async (draft, { signal }) => api.save(draft, { signal })),
	);
	bus.on(
		"search",
		debounce(
			300,
			latest(async (query) => void query),
		),
	);

	return bus;
};

// 5. The first effects: retry and timeout wrap a handler
const searchTask = (query: string, { signal }: { signal: AbortSignal }) =>
	api.search(query, { signal });

export const step5 = () => {
	const bus = createBus<Events>();

	bus.on("typed", latest(retry(timeout(5000, searchTask), { times: 3 })));

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

	bus.on("scroll", async (_position, ctx) => {
		const items = await retry(ctx, () =>
			api.search("more", { signal: ctx.signal }),
		);
		void items;
	});

	return bus;
};

// 6. Several things at once, and waiting for another event
export const step6 = async () => {
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
		const position = await take(ctx, "scroll");
		seen.push(`${query} at ${position}`);
	});
	bus.emit("typed", "nano");
	bus.emit("scroll", 40);
	await new Promise((resolve) => setTimeout(resolve, 0));

	return seen;
};

// 7. Three ways to name an event
const moved = createAction("moved");
const double = createCommand("math/double", (value: number) => value * 2);

export const step7 = () => {
	const seen: unknown[] = [];
	const bus = createBus<Events>();

	bus.on("moved", ({ x }) => {
		seen.push(`string ${x}`);
	});
	bus.on(moved, ({ x }) => {
		seen.push(`action ${x}`);
	});

	bus.emit("moved", { x: 1, y: 2 });
	bus.emit({ type: "moved", payload: { x: 2, y: 2 } });
	bus.emit(moved({ x: 3, y: 2 }));
	seen.push(bus.emit(double(21)));

	return seen;
};

// 8. A command needs a registered handler
const getUser = createCommand<string, Promise<User>>("user/get");

export const step8 = async () => {
	const seen: string[] = [];
	const bus = createBus<Events>();
	const commands = bus.use(commandsPlugin());

	try {
		bus.emit(getUser("1"));
	} catch (error) {
		seen.push((error as Error).message);
	}

	const unregister = commands.handle(getUser, async (id) => ({
		id,
		name: `user ${id}`,
	}));
	const user = await bus.emit(getUser("1"));
	seen.push(user.name);

	unregister();
	try {
		bus.emit(getUser("1"));
	} catch (error) {
		seen.push((error as Error).message);
	}

	return seen;
};

// 9. Modules: one feature, one unmount — on / handle / use each have a job
export const step9 = () => {
	const seen: unknown[] = [];
	const bus = createBus<Events>();
	const greeting = createModule<Events>("greeting", (m) => {
		m.on("greet", (name) => {
			seen.push(`hello ${name}`);
		});
		m.handle(getUser, async (id) => ({ id, name: "from the module" }));
		m.use(double);
	});

	const app = bus.use(modulePlugin([greeting]));
	bus.emit("greet", "Ada");
	seen.push(bus.emit(getUser("1")) instanceof Promise);
	seen.push(bus.emit(double(2)));
	app.unmount(greeting);
	bus.emit("greet", "Bob"); // listener is gone

	return seen;
};

// 10. Types (optional): describe the events once
export const step10 = () => {
	const seen: number[] = [];
	const bus = createBus<Events>();

	bus.on("moved", ({ x, y }) => {
		seen.push(x + y);
	});
	bus.emit("moved", { x: 1, y: 2 });
	bus.emit("reset");
	// bus.emit("moved", { x: "1" });
	// bus.emit("jumped", 1);

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
	bus.emit("greet", "Ada");
	bus.emit("reset");

	return problems;
};
