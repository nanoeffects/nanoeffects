import { createStore } from "zustand/vanilla";
import type { Message } from "../../shared/api";
import type { SearchResult } from "./search";

type SearchState = {
	searching: boolean;
	hits: Message[];
	skipped: string[];
	// the room that is open, kept here from the roomSelected event
	selectedRoom: string | null;
};

// What can be done to the state. A module calls these with data; nothing else writes the state.
type SearchMutations = {
	startSearching: () => void;
	showResult: (result: SearchResult) => void;
	stopSearching: () => void;
	selectRoom: (roomId: string) => void;
};

export const searchStore = createStore<SearchState & SearchMutations>()(
	(set) => ({
		searching: false,
		hits: [],
		skipped: [],
		selectedRoom: null,

		startSearching: () => set({ searching: true }),

		showResult: ({ hits, skipped }) => set({ searching: false, hits, skipped }),

		stopSearching: () => set({ searching: false }),

		selectRoom: (roomId) => set({ selectedRoom: roomId }),
	}),
);
