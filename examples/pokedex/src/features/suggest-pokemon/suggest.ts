import { createAction } from "nanoeffects/actions";
import { suggestStore } from "./suggest-store";

// The events of the suggest-pokemon feature. This file imports no bus.

// createAction<Payload> — the text of the search box changed
export const queryTyped = createAction<string>("suggest/queryTyped");

// createAction — an order for this feature, with the handler that does it: close the suggestions.
// The module binds it with module.use, so a component never writes the store.
export const clearSuggestions = createAction("suggest/clear", () =>
	suggestStore.getState().clear(),
);
