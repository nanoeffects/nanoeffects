import { createAction } from "nanoeffects/actions";

// createAction — an event with a name; calling it builds { type, payload }
// The buttons send the "Requested" events, the handlers send the results.
export const incrementLaterRequested = createAction(
	"counter/incrementLaterRequested",
);
export const incrementCancelled = createAction("counter/incrementCancelled");
export const incrementFlakyRequested = createAction(
	"counter/incrementFlakyRequested",
);
export const incrementBrokenRequested = createAction(
	"counter/incrementBrokenRequested",
);
export const incremented = createAction("counter/incremented");
export const failed = createAction<string>("counter/failed");
