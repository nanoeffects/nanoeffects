// Type-checked by TypeScript 5.9 against the built declaration files (`pnpm types:ts5`).
// It imports every entry and uses the calls whose types are the hardest to infer.
import { type Context, createBus } from "nanoeffects";
import {
	createAction,
	createCommand,
	createJob,
	createModule,
} from "nanoeffects/actions";
import { contextPlugin } from "nanoeffects/context";
import {
	all,
	allSettled,
	delay,
	effectsPlugin,
	race,
	retry,
	type StarterOf,
	take,
} from "nanoeffects/effects";
import { matchPlugin } from "nanoeffects/match";
import { Emitter } from "nanoeffects/oop";
import { latest } from "nanoeffects/policies";
import { signalPlugin } from "nanoeffects/signal";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

type Events = { search: string; leave: undefined };
type User = { name: string };

declare const loadUser: (id: string) => Promise<User>;

const bus = createBus<Events>()
	.use(effectsPlugin({ race, delay }))
	.use(contextPlugin({ api: "x" }));
bus.use(matchPlugin);
bus.use(signalPlugin);
bus.use(tracePlugin);

const stored: StarterOf<Events> = all({ user: retry(() => loadUser("1")) });

bus.on(
	"search",
	latest(async (query, ctx) => {
		const result = await race(ctx, {
			loaded: all({ user: retry(() => loadUser(query)) }),
			settled: allSettled([retry(() => loadUser(query))]),
			left: take("leave"),
			waited: delay(1000),
			stored,
		});
		const user: User | undefined = result.loaded?.user;
		const first: PromiseSettledResult<User> | undefined = result.settled?.[0];
		const users = await all(ctx, [retry(() => loadUser(query))], {
			concurrency: 5,
		});
		const second: User | undefined = users[0];

		return [user, first, second];
	}),
);

export const search = createAction<string, "search">("search");
export const load = createCommand(
	"load",
	async (id: string, _ctx: Context<Events>) => loadUser(id),
);
export const job = createJob("job", async (id: string) => id);
export const feature = createModule("feature", () => {});
export const tracer = createTracer(consoleLogger());
export class Searcher extends Emitter<Events> {}
