// The bus lives outside React: created once here, not in a component, so every render shares it.
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";
import { consoleLogger, createTracer, reduxDevtools } from "nanoeffects/trace";
import { createFakeApi, type Item, type RequestEvent } from "./fake-api";

type Events = {
	typed: string;
	results: Item[];
};

export type TraceLine = { id: number; label: string; phase: string };

// the page reads these lists with useSyncExternalStore: every change makes a new array
let requestLog: RequestEvent[] = [];
let traceLines: TraceLine[] = [];
const listeners = new Set<() => void>();

const notify = () => {
	for (const listener of listeners) {
		listener();
	}
};

export const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const getRequestLog = () => requestLog;
export const getTraceLines = () => traceLines;

// the fake server reports every request, so the abort is visible
const api = createFakeApi((event) => {
	requestLog = [event, ...requestLog];
	notify();
});

export const bus = createBus<Events>({
	// createTracer — sends each task phase (start, done, cancel, error) to its loggers.
	// A logger is a function of the event: the first fills the list on the page,
	// consoleLogger prints the same events to the browser console,
	// reduxDevtools sends them to the Redux DevTools extension (no extension, no effect)
	trace: createTracer([
		(event) => {
			const line = {
				id: traceLines.length,
				label: `${event.type} · ${event.effect}`,
				phase: event.phase,
			};
			traceLines = [line, ...traceLines].slice(0, 30);
			notify();
		},
		consoleLogger(),
		reduxDevtools({ name: "nanoeffects playground" }),
	]),
});

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
