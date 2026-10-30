import { createStore } from "zustand/vanilla";
import type { AbilityText } from "../../shared/api";

type AbilitiesState = { loading: boolean; items: AbilityText[] };

// What can be done to the state. A module calls these with data; nothing else writes the state.
type AbilitiesMutations = {
	startLoading: () => void;
	showTexts: (items: AbilityText[]) => void;
	stopLoading: () => void;
	clear: () => void;
};

export const abilityStore = createStore<AbilitiesState & AbilitiesMutations>()(
	(set) => ({
		loading: false,
		items: [],

		startLoading: () => set({ loading: true, items: [] }),

		showTexts: (items) => set({ loading: false, items }),

		stopLoading: () => set({ loading: false }),

		clear: () => set({ loading: false, items: [] }),
	}),
);
