// The entry: create the bus, mount the modules and call a command.
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { getUser, userModule } from "./user";

const bus = createBus(); // the bus: events and handlers

// modulePlugin — mount the modules on the bus
const app = bus.use(modulePlugin([userModule]));

// The result is typed from the handler: Promise<User>
export const user = bus.emit(getUser("1"));
export { app };
