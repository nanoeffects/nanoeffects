import { createModule } from "nanoeffects/actions";
import { clearAbilities, loadAbilities } from "../../entities/ability/ability";
import { findPokemon } from "../../entities/pokemon/pokemon";

// createModule — a feature that connects two entities: a found pokémon shows its abilities.
// Neither entity knows the other; this module is the only place that knows both.
export const showAbilitiesModule = createModule("show-abilities", (module) => {
	// on — a new search empties the old abilities
	module.on(findPokemon.pending, (_, ctx) => {
		ctx.emit(clearAbilities());
	});

	// on — a found pokémon starts loading its own abilities
	module.on(findPokemon.success, (pokemon, ctx) => {
		ctx.emit(loadAbilities(pokemon.abilities));
	});
});
