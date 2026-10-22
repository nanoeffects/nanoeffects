// SPA search: wait for quiet, then a newer query aborts the older request.
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";
import { createFakeApi, type Item } from "./fake-api";

type Events = {
	typed: string;
	results: Item[];
};

const input = document.querySelector<HTMLInputElement>("#query");
const requests = document.querySelector<HTMLUListElement>("#requests");
const result = document.querySelector<HTMLParagraphElement>("#result");

// the fake server writes one line per request, so the abort is visible
const api = createFakeApi(({ query: text, status }) => {
	const line = document.createElement("li");
	line.className = status;
	line.textContent = `"${text}": ${status}`;
	requests?.prepend(line);
});

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
	if (result) {
		result.textContent = items.map((item) => item.title).join(", ");
	}
});

input?.addEventListener("input", () => {
	bus.emit("typed", input.value);
});
