import { createStore } from "zustand/vanilla";
import type { Message } from "../../api";

export type SearchState = {
	searching: boolean;
	hits: Message[];
	skipped: string[];
	// the room that is open, kept here from the roomSelected event
	selectedRoom: string | null;
};

export const searchStore = createStore<SearchState>(() => ({
	searching: false,
	hits: [],
	skipped: [],
	selectedRoom: null,
}));
