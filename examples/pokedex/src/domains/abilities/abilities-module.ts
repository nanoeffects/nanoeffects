import { createModule } from "nanoeffects/actions";
import { findPokemon } from "../pokemon/pokemon";
import { loadAbilities } from "./abilities";
import { loadAbilityTexts } from "./abilities-handlers";
import { abilitiesStore } from "./abilities-store";

export const abilitiesModule = createModule("abilities", (module) => {
	const { startLoading, showTexts, stopLoading, clear } =
		abilitiesStore.getState();

	// handle — this module does the work of the loadAbilities job while it is mounted
	module.handle(loadAbilities, loadAbilityTexts);

	module.on(loadAbilities.pending, startLoading);
	module.on(loadAbilities.success, showTexts);
	module.on(loadAbilities.fail, stopLoading);
	module.on(loadAbilities.cancel, stopLoading);

	// a new search empties the old abilities; a found pokémon starts loading its own
	module.on(findPokemon.pending, clear);
	module.on(findPokemon.success, (pokemon, ctx) => {
		ctx.emit(loadAbilities(pokemon.abilities));
	});
});
