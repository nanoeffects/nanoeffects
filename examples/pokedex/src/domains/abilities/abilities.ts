import { createJob } from "nanoeffects/actions";
import type { AbilityText } from "../../api";

// The events of the abilities domain. This file imports no bus.

// createJob — load the text of every ability of a pokémon; the payload is the list of names
export const loadAbilities = createJob<string[], AbilityText[]>(
	"abilities/load",
);
