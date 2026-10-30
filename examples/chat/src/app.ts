import { modulePlugin } from "nanoeffects/actions";
import { messageModule } from "./entities/message/message-module";
import { roomModule } from "./entities/room/room-module";
import { receiveMessagesModule } from "./features/receive-messages/receive-messages-module";
import { searchModule } from "./features/search-messages/search-module";
import { showHistoryModule } from "./features/show-history/show-history-module";
import { bus } from "./shared/bus";

// modulePlugin — the app that mounts and unmounts modules. The given modules start at the end of
// this block, in this order, even if nothing uses the bus yet: the entities, then the features that
// connect them. The room entity goes last: it starts loading as soon as it is mounted.
export const app = bus.use(
	modulePlugin([
		messageModule,
		showHistoryModule,
		searchModule,
		receiveMessagesModule,
		roomModule,
	]),
);
