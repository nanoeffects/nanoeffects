import { modulePlugin } from "nanoeffects/actions";
import { abilityModule } from "./entities/ability/ability-module";
import { pokemonModule } from "./entities/pokemon/pokemon-module";
import { showAbilitiesModule } from "./features/show-abilities/show-abilities-module";
import { bus } from "./shared/bus";

// modulePlugin — the app that mounts and unmounts modules. The given modules start at the end of
// this block, even if nothing uses the bus yet: the entities, then the feature that connects them.
export const app = bus.use(
	modulePlugin([pokemonModule, abilityModule, showAbilitiesModule]),
);
