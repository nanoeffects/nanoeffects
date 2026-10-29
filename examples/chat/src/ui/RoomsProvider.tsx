import { createContext, type ReactNode, useContext } from "react";
import type { Room } from "../api";
import { useEventState } from "../bus";
import { loadRooms } from "../domains/rooms/rooms";

const RoomsContext = createContext<Room[]>([]);

export function RoomsProvider({ children }: { children: ReactNode }) {
	// useEventState — like useState([]), but the success of loadRooms sets the value; it is a Room[]
	// WARNING: this is state of this provider, not a global store. An event that came before the
	// provider mounted is lost: the bus keeps no values. Mount it once at the root, and keep a
	// value that must outlive it in a store of its own, as the other domains do.
	const [rooms] = useEventState(loadRooms.success, []);

	return (
		<RoomsContext.Provider value={rooms}>{children}</RoomsContext.Provider>
	);
}

export const useRooms = () => useContext(RoomsContext);
