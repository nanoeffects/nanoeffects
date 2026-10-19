// Commands and modules: what a domain does, apart from the code that does it.
import { createBus } from "nanoeffects";
import {
	createAction,
	createCommand,
	createJob,
	createModule,
	registerModules,
} from "nanoeffects/actions";

type User = { id: string; name: string };
type Events = { "user/loaded": User };

declare const fetchUser: (
	id: string,
	options: { signal: AbortSignal },
) => Promise<User>;

const userLoaded = createAction("user/loaded"); // the payload type comes from `Events`

// a request for a result, and a job that sends its outcome on as an event
export const getUser = createCommand("user/get", (id: string, { signal }) =>
	fetchUser(id, { signal }),
);
export const loadUser = createJob("user/load", fetchUser, { done: userLoaded });

export const userModule = createModule<Events>("user", (m) => {
	m.on(userLoaded, (user) => console.log(`loaded ${user.name}`));
	m.spawn(async (_, ctx) => {
		// background work that ends with the module
		await new Promise((resolve) =>
			ctx.signal.addEventListener("abort", resolve),
		);
	});
});

const bus = createBus<Events>();
const app = registerModules(bus, [userModule]);

export const user = bus.emit(getUser, "1"); // a promise of the user
export const unmount = app.mount(
	createModule<Events>("audit", (m) => {
		m.on(userLoaded, (loaded) => console.log("audit", loaded.id));
	}),
);
