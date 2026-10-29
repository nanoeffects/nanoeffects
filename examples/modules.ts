// Domain on the bus, no UI: the "user" feature mounts and unmounts as one unit.
import { createBus, type WithSignal } from "nanoeffects";
import { createCommand, createModule, modulePlugin } from "nanoeffects/actions";

type User = { id: string; name: string };
type Events = { "user/loaded": User };

declare const fetchUser: (id: string, options: WithSignal) => Promise<User>;

// createCommand without a handler — contract; the module answers while mounted
export const getUser = createCommand<string, Promise<User>>("user/get");
// createCommand with a handler — m.use only registers it for the module’s life
export const saveUser = createCommand("user/save", (user: User) => user.id);

// createModule — one feature; unmount undoes handle / use / on
export const userModule = createModule<Events>("user", (m) => {
	m.handle(getUser, (id, { signal }) => fetchUser(id, { signal }));
	m.use(saveUser);
	m.on("user/loaded", (user) => console.log(`loaded ${user.name}`));
});

const bus = createBus<Events>();
// modulePlugin — mount modules on the bus
bus.use(modulePlugin([userModule]));

export const user = bus.emit(getUser("1"));
