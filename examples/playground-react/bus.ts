// The bus lives outside React: created once here, not in a component.
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";
import { reactPlugin } from "nanoeffects/react";
import { consoleLogger, createTracer } from "nanoeffects/trace";
import { api, type Item } from "./fake-api";

type Events = {
	typed: string;
	results: Item[];
};

// createTracer — sends each task phase (start, done, cancel) to its loggers;
// consoleLogger prints them to the browser console
const trace = createTracer(consoleLogger());

// reactPlugin adds bus.useEmitter; destructuring it gives a hook to use in components
export const bus = createBus<Events>({ trace }).use(reactPlugin());
export const { useEmitter } = bus;

// debounce — wait 300 ms of quiet; latest — abort the previous search
bus.on(
	"typed",
	debounce(
		300,
		latest(async (query, ctx) => {
			// latest aborts ctx.signal when a newer query arrives; passing it on cancels this request
			const items = await api.search(query, { signal: ctx.signal });
			ctx.emit("results", items);
		}),
	),
);
