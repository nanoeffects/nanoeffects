import { createModule } from "nanoeffects/actions";
import { pokemonIndexStore } from "../../entities/pokemon-index/pokemon-index-store";
import { clearSuggestions, queryTyped } from "./suggest";
import { suggestionsFor } from "./suggest-filter";
import { suggestStore } from "./suggest-store";

// createModule — a feature: it reads the list that the pokemon-index entity keeps and turns the
// text into suggestions. There is no request here: the list was loaded once.
export const suggestModule = createModule("suggest-pokemon", (module) => {
	const { show } = suggestStore.getState();

	// on — every change of the text filters the list again
	module.on(queryTyped, (text) => {
		show(suggestionsFor(text, pokemonIndexStore.getState().names));
	});

	// use — a command that carries its handler: bind it for as long as this module is mounted
	module.use(clearSuggestions);
});
