import { createModule } from "nanoeffects/actions";
import { roomSelected } from "../rooms/rooms";
import { openResult, searchMessages } from "./search";
import { goToResult, runSearch } from "./search-handlers";
import { searchStore } from "./search-store";

export const searchModule = createModule("search", (module) => {
	// the mutations of the store: each one is called with the data of an event
	const { startSearching, showResult, stopSearching, selectRoom } =
		searchStore.getState();

	// handle — this module does the work of the searchMessages job while it is mounted
	module.handle(searchMessages, runSearch);

	// the outcomes of the search drive the state; a replaced search sends cancel before the next pending
	module.on(searchMessages.pending, startSearching);
	module.on(searchMessages.success, showResult);
	module.on(searchMessages.fail, stopSearching);
	module.on(searchMessages.cancel, stopSearching);

	// the open room comes from an event, not from the store of another domain
	module.on(roomSelected, selectRoom);
	// handle — this module answers the openResult command while it is mounted
	module.handle(openResult, goToResult);
});
