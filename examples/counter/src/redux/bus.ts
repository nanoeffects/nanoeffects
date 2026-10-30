import { createBus, type WithContext } from "nanoeffects";
import type { ReduxStoreApi } from "nanoeffects/redux";
import type { CounterState } from "./slice";

// Checker only: the tasks also have ctx.store. The middleware puts it there at run time.
// The names are the types of the actions of slice.ts; none of them carries a payload except failed.
export type Events = {
	"counter/incremented": undefined;
	"counter/failed": string;
	"counter/incrementLaterRequested": undefined;
	"counter/incrementCancelled": undefined;
	"counter/incrementFlakyRequested": undefined;
	"counter/incrementBrokenRequested": undefined;
} & WithContext<{ store: ReduxStoreApi<{ counter: CounterState }> }>;

// createBus — the event bus; it exists before the store
// onError — an error that no handler caught goes here, and the other handlers still run
export const bus = createBus<Events>({
	onError: (error, { type }) =>
		console.error(`A handler of "${type}" failed`, error),
});
