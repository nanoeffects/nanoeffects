import { createModule } from "nanoeffects/actions";
import { loadRooms, roomSelected } from "./rooms";
import { fetchRooms } from "./rooms-handlers";
import { roomsStore } from "./rooms-store";

// createModule — one domain: mounting it starts what it lists, unmounting undoes all of it
export const roomsModule = createModule("rooms", (module) => {
	// handle — this module does the work of the loadRooms job while it is mounted
	module.handle(loadRooms, fetchRooms);

	// on — keep the selected room for the components that read the store
	module.on(roomSelected, (id) => roomsStore.setState({ selected: id }));

	// the first room is selected as soon as the list arrives
	module.on(loadRooms.success, (rooms, ctx) => {
		const first = rooms[0];
		if (first) {
			ctx.emit(roomSelected(first.id));
		}
	});

	// spawn — load the list once when the module is mounted; the UI does not know about it
	module.spawn(async (_, ctx) => {
		await ctx.emit(loadRooms());
	});
});
