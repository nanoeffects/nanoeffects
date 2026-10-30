import { createStore } from "zustand/vanilla";

type SuggestState = { items: string[] };

// What can be done to the state. A module calls these with data; nothing else writes the state.
type SuggestMutations = {
	show: (items: string[]) => void;
	clear: () => void;
};

export const suggestStore = createStore<SuggestState & SuggestMutations>()(
	(set) => ({
		items: [],

		show: (items) => set({ items }),

		clear: () => set({ items: [] }),
	}),
);
