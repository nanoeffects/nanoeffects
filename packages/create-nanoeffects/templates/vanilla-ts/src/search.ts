import { createAction } from "nanoeffects/actions";

// createAction<Payload> — an event with a name and the type of its payload;
// handlers and listeners get that type with no other annotation
export const queryChanged = createAction<string>("search/queryChanged");
export const searchLoaded = createAction<string[]>("search/loaded");
