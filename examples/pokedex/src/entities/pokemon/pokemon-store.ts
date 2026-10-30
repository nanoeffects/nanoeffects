import { createStore } from "zustand/vanilla";
import { HttpError, type Pokemon } from "../../shared/api";

type PokemonState = {
	status: "idle" | "loading" | "found" | "failed";
	pokemon: Pokemon | null;
	message: string;
};

// What can be done to the state. A module calls these with data; nothing else writes the state.
type PokemonMutations = {
	startLoading: () => void;
	showPokemon: (pokemon: Pokemon) => void;
	showFailure: (error: unknown) => void;
	stopLoading: () => void;
};

export const pokemonStore = createStore<PokemonState & PokemonMutations>()(
	(set) => ({
		status: "idle",
		pokemon: null,
		message: "",

		startLoading: () => set({ status: "loading", message: "" }),

		showPokemon: (pokemon) => set({ status: "found", pokemon, message: "" }),

		// the outcome `fail` carries the error: a 404 means there is no such pokémon, anything else that
		// the server did not answer
		showFailure: (error) =>
			set({
				status: "failed",
				message:
					error instanceof HttpError && error.status === 404
						? "No such pokémon"
						: "PokeAPI did not answer, try again",
			}),

		// the task was aborted: a newer search sends `pending` right after this
		stopLoading: () => set({ status: "idle" }),
	}),
);
