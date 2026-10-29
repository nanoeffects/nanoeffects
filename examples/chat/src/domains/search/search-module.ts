import { createModule } from "nanoeffects/actions";
import { roomSelected } from "../rooms/rooms";
import { resultOpened, searchMessages } from "./search";
import { openResult, runSearch } from "./search-handlers";
import { searchStore } from "./search-store";

export const searchModule = createModule("search", (module) => {
	// handle — this module does the work of the searchMessages job while it is mounted
	module.handle(searchMessages, runSearch);

	// the outcomes of the search drive the state; a replaced search sends cancel before the next pending
	module.on(searchMessages.pending, () =>
		searchStore.setState({ searching: true }),
	);
	module.on(searchMessages.success, ({ hits, skipped }) =>
		searchStore.setState({ searching: false, hits, skipped }),
	);
	module.on(searchMessages.fail, () =>
		searchStore.setState({ searching: false }),
	);
	module.on(searchMessages.cancel, () =>
		searchStore.setState({ searching: false }),
	);

	// the open room comes from an event, not from the store of another domain
	module.on(roomSelected, (id) => searchStore.setState({ selectedRoom: id }));
	module.on(resultOpened, openResult);
});
