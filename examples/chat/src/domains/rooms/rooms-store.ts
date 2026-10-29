import { createStore } from "zustand/vanilla";

// A Zustand store, made outside React: the rooms module writes it, a component reads it
export const roomsStore = createStore<{ selected: string | null }>(() => ({
	selected: null,
}));
