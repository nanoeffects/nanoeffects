// A search box: a new query aborts the previous one, the request is retried,
// and nothing is written after the task is aborted.
import { createBus } from "nanoeffects";
import { retry, timeout } from "nanoeffects/effects";
import { debounce, latest } from "nanoeffects/policies";

type Item = { id: number; title: string };
type Events = {
	typed: string;
	results: Item[];
};

declare const api: {
	search(query: string, options: { signal: AbortSignal }): Promise<Item[]>;
};

export const bus = createBus<Events>({
	onUnhandled: ({ type }) => console.warn(`Nobody listens to "${type}"`),
});

// wait for 300 ms of quiet, then search; a newer search aborts the older one
bus.on(
	"typed",
	debounce(
		300,
		latest(async (query, ctx) => {
			const items = await retry(
				ctx,
				() => timeout(ctx, 5000, ({ signal }) => api.search(query, { signal })),
				{ times: 3, delay: (attempt) => 2 ** attempt * 100 },
			);
			ctx.emit("results", items);
		}),
	),
);

bus.on("results", (items) => {
	console.log(`${items.length} results`);
});

bus.emit("typed", "nano");
