import { useStore } from "zustand";
import { bus } from "../bus";
import { roomSelected } from "../domains/rooms/rooms";
import { roomsStore } from "../domains/rooms/rooms-store";
import { useRooms } from "./RoomsProvider";

export function RoomList() {
	const rooms = useRooms();
	const { selected } = useStore(roomsStore);

	return (
		<nav className="rooms">
			{rooms.map((room) => (
				<button
					key={room.id}
					type="button"
					className={room.id === selected ? "selected" : ""}
					// bus.emit — say which room was selected; the domains decide what that means
					onClick={() => bus.emit(roomSelected(room.id))}
				>
					{room.name}
				</button>
			))}
		</nav>
	);
}
