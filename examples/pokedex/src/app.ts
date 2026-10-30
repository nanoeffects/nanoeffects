import { modulePlugin } from "nanoeffects/actions";
import { abilityModule } from "./entities/ability/ability-module";
import { pokemonModule } from "./entities/pokemon/pokemon-module";
import { pokemonIndexModule } from "./entities/pokemon-index/pokemon-index-module";
import { showAbilitiesModule } from "./features/show-abilities/show-abilities-module";
import { suggestModule } from "./features/suggest-pokemon/suggest-module";
import { bus } from "./shared/bus";

// modulePlugin — the app that mounts and unmounts modules. The given modules start at the end of
// this block, even if nothing uses the bus yet: the entities, then the features that use them.
export const app = bus.use(
	modulePlugin([
		pokemonModule,
		abilityModule,
		pokemonIndexModule,
		showAbilitiesModule,
		suggestModule,
	]),
);
