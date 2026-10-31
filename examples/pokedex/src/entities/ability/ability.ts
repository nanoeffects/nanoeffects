import { createAction, createJob } from "nanoeffects/actions";
import type { AbilityText } from "../../shared/api";
import { abilityStore } from "./ability-store";

// The events of the ability entity. This file imports no bus.

// createJob — load the text of every ability of a pokémon; the payload is the list of names
export const loadAbilities = createJob<string[], AbilityText[]>(
	"abilities/load",
);

// createAction — an order for this entity, with the handler that does it: empty the abilities.
// The feature that connects the pokémon to its abilities emits it, so it never writes the store.
// The module binds the command with module.use for as long as it is mounted.
export const clearAbilities = createAction("abilities/clear", () =>
	abilityStore.getState().clear(),
);
