// The search of the DOM playground, with its tasks sent to Redux DevTools.
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";
import { createTracer, reduxDevtools } from "nanoeffects/trace";
import { api, type Item } from "./fake-api";

type Events = {
	typed: string;
	results: Item[];
};

// reduxDevtools — a logger that sends each finished task to the extension as an action;
// it does nothing when the extension is absent. name is the instance in the extension's list
const trace = createTracer(reduxDevtools({ name: "search playground" }));

const bus = createBus<Events>({ trace });

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

const input = document.querySelector<HTMLInputElement>("#query");
const list = document.querySelector<HTMLUListElement>("#results");

bus.on("results", (items) => {
	list?.replaceChildren(
		...items.map((item) => {
			const line = document.createElement("li");
			line.textContent = item.title;
			return line;
		}),
	);
});

input?.addEventListener("input", () => {
	bus.emit("typed", input.value);
});
