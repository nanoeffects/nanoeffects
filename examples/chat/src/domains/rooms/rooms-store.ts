import { createStore } from "zustand/vanilla";

type RoomsState = { selected: string | null };

// What can be done to the state. A module calls these with data; nothing else writes the state.
type RoomsMutations = {
	select: (roomId: string) => void;
};

// A Zustand store, made outside React. `set` merges the object it is given into the state.
export const roomsStore = createStore<RoomsState & RoomsMutations>()((set) => ({
	selected: null,

	select: (roomId) => set({ selected: roomId }),
}));
