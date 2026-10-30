import { createModule } from "nanoeffects/actions";
import { loadHistory } from "../../entities/message/message";
import { roomSelected } from "../../entities/room/room";

// createModule — a feature that connects two entities: when a room is selected, its history loads.
// Neither entity knows the other; this module is the only place that knows both.
export const showHistoryModule = createModule("show-history", (module) => {
	// on — a new room starts a load; latest in the history handler aborts the one still running
	module.on(roomSelected, (roomId, ctx) => {
		ctx.emit(loadHistory(roomId));
	});
});
