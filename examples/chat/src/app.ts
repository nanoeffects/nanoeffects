import { modulePlugin } from "nanoeffects/actions";
import { bus } from "./bus";
import { incomingModule } from "./domains/incoming/incoming-module";
import { messagesModule } from "./domains/messages/messages-module";
import { roomsModule } from "./domains/rooms/rooms-module";
import { searchModule } from "./domains/search/search-module";

// modulePlugin — the app that mounts and unmounts domains; it starts with none
export const app = bus.use(modulePlugin([]));

// mount — start the domains in this order. Rooms goes last: it starts loading as soon as it is mounted.
app.mount(messagesModule, searchModule, incomingModule, roomsModule);
