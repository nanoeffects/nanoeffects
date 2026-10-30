import { createModule } from "nanoeffects/actions";
import { loadPokemonIndex } from "./pokemon-index";
import { fetchNames } from "./pokemon-index-handlers";
import { pokemonIndexStore } from "./pokemon-index-store";

// createModule — one entity: mounting it starts what it lists, unmounting undoes all of it
export const pokemonIndexModule = createModule("pokemon-index", (module) => {
	const { startLoading, showNames, showFailure } = pokemonIndexStore.getState();

	// handle — this module does the work of the loadPokemonIndex job while it is mounted
	module.handle(loadPokemonIndex, fetchNames);

	module.on(loadPokemonIndex.pending, startLoading);
	module.on(loadPokemonIndex.success, showNames);
	module.on(loadPokemonIndex.fail, showFailure);
	module.on(loadPokemonIndex.cancel, showFailure);

	// spawn — load the list once when the module is mounted; the UI does not know about it
	module.spawn(async (_, ctx) => {
		try {
			await ctx.emit(loadPokemonIndex());
		} catch {
			// the outcome `fail` has already told the store; the page works without suggestions
		}
	});
});
