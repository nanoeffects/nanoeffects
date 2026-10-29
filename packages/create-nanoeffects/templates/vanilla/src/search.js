import { createAction } from "nanoeffects/actions";

// createAction — an event with a name; calling it builds { type, payload }
export const queryChanged = createAction("search/queryChanged");
export const searchLoaded = createAction("search/loaded");
