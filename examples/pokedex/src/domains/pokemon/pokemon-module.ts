import { createModule } from "nanoeffects/actions";
import { findPokemon, pickRandom } from "./pokemon";
import { searchPokemon } from "./pokemon-handlers";
import { pokemonStore } from "./pokemon-store";

// createModule — one domain: mounting it starts what it lists, unmounting undoes all of it
export const pokemonModule = createModule("pokemon", (module) => {
	const { startLoading, showPokemon, showFailure, stopLoading } =
		pokemonStore.getState();

	// handle — this module does the work of the findPokemon job while it is mounted
	module.handle(findPokemon, searchPokemon);

	// the outcomes of the search: the state follows them, so an aborted search clears "loading" too
	module.on(findPokemon.pending, startLoading);
	module.on(findPokemon.success, showPokemon);
	module.on(findPokemon.fail, showFailure);
	module.on(findPokemon.cancel, stopLoading);

	// use — a command that carries its handler: bind it for as long as this module is mounted
	module.use(pickRandom);
});
