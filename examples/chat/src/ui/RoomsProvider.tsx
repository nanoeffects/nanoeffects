import { createContext, type ReactNode, useContext } from "react";
import { loadRooms } from "../entities/room/room";
import type { Room } from "../shared/api";
import { useEventState } from "../shared/bus";

const RoomsContext = createContext<Room[]>([]);

export function RoomsProvider({ children }: { children: ReactNode }) {
	// useEventState — like useState([]), but the success of loadRooms sets the value; it is a Room[]
	// WARNING: this is state of this provider, not a global store. An event that came before the
	// provider mounted is lost: the bus keeps no values. Mount it once at the root, and keep a
	// value that must outlive it in a store of its own, as the entities do.
	const [rooms] = useEventState(loadRooms.success, []);

	return (
		<RoomsContext.Provider value={rooms}>{children}</RoomsContext.Provider>
	);
}

export const useRooms = () => useContext(RoomsContext);
