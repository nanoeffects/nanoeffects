import { createStore } from "zustand/vanilla";

type PokemonIndexState = {
	names: string[];
	loading: boolean;
	failed: boolean;
};

// What can be done to the state. A module calls these with data; nothing else writes the state.
type PokemonIndexMutations = {
	startLoading: () => void;
	showNames: (names: string[]) => void;
	showFailure: () => void;
};

export const pokemonIndexStore = createStore<
	PokemonIndexState & PokemonIndexMutations
>()((set) => ({
	names: [],
	loading: false,
	failed: false,

	startLoading: () => set({ loading: true, failed: false }),

	showNames: (names) => set({ loading: false, failed: false, names }),

	showFailure: () => set({ loading: false, failed: true }),
}));
