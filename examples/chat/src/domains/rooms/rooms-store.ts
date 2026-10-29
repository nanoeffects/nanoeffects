import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";

type RoomsState = { selected: string | null };

// What can be done to the state. A module calls these with data; nothing else writes the state.
type RoomsMutations = {
	select: (roomId: string) => void;
};

// A Zustand store, made outside React. The immer middleware lets a mutation change the state in
// place (`state.selected = roomId`); the store still hands out a new object, so React renders again.
export const roomsStore = createStore<RoomsState & RoomsMutations>()(
	immer((set) => ({
		selected: null,

		select: (roomId) =>
			set((state) => {
				state.selected = roomId;
			}),
	})),
);
