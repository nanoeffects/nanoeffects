import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import type { Message } from "../../api";
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
	immer((set) => ({
		searching: false,
		hits: [],
		skipped: [],
		selectedRoom: null,

		startSearching: () =>
			set((state) => {
				state.searching = true;
			}),

		showResult: ({ hits, skipped }) =>
			set((state) => {
				state.searching = false;
				state.hits = hits;
				state.skipped = skipped;
			}),

		stopSearching: () =>
			set((state) => {
				state.searching = false;
			}),

		selectRoom: (roomId) =>
			set((state) => {
				state.selectedRoom = roomId;
			}),
	})),
);
