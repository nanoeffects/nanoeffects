import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";

export const bus = createBus(); // the event bus
// modulePlugin with no module starts nothing: the launcher mounts the chat module when it is opened
export const app = bus.use(modulePlugin());
