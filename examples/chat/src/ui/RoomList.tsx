import { useStore } from "zustand";
import { roomSelected } from "../entities/room/room";
import { roomStore } from "../entities/room/room-store";
import { bus } from "../shared/bus";
import { useRooms } from "./RoomsProvider";

export function RoomList() {
	const rooms = useRooms();
	const { selected } = useStore(roomStore);

	return (
		<nav className="rooms">
			{rooms.map((room) => (
				<button
					key={room.id}
					type="button"
					className={room.id === selected ? "selected" : ""}
					// bus.emit — say which room was selected; the entities and features decide what that means
					onClick={() => bus.emit(roomSelected(room.id))}
				>
					{room.name}
				</button>
			))}
		</nav>
	);
}
