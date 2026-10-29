import { modulePlugin } from "nanoeffects/actions";
import { bus } from "./bus";
import { incomingModule } from "./domains/incoming/incoming-module";
import { messagesModule } from "./domains/messages/messages-module";
import { roomsModule } from "./domains/rooms/rooms-module";
import { searchModule } from "./domains/search/search-module";

// modulePlugin — the app that mounts and unmounts domains. The given domains start at the end of
// this block, in this order, even if nothing uses the bus yet. Rooms goes last: it starts
// loading as soon as it is mounted.
export const app = bus.use(
	modulePlugin([messagesModule, searchModule, incomingModule, roomsModule]),
);
