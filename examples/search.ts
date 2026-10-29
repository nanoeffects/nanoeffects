// SPA search: wait for quiet, then a newer query aborts the older request.
import { createBus, type WithSignal } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

type Item = { id: number; title: string };
type Events = {
	typed: string;
	results: Item[];
};

declare const api: {
	search(query: string, options: WithSignal): Promise<Item[]>;
};

export const bus = createBus<Events>();

// debounce — wait 300 ms of quiet; latest — abort the previous search
bus.on(
	"typed",
	debounce(
		300,
		latest(async (query, ctx) => {
			// latest aborts ctx.signal when a newer query arrives; passing it on cancels
			// this request. Without it the old one keeps running and only its result is dropped
			const items = await api.search(query, { signal: ctx.signal });
			ctx.emit("results", items);
		}),
	),
);

bus.on("results", (items) => {
	console.log(`${items.length} results`);
});

bus.emit("typed", "nano");
