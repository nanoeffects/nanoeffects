// The entry: mount the modules and call an action.
import { app, bus } from "./bus";
import { getUser, userModule } from "./user";

// mount — start the module; unmount() undoes everything it did
export const unmount = app.mount(userModule);

// The result is typed from the action: Promise<User>
export const user = bus.emit(getUser("1"));
