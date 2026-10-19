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

// a request for a result: only the contract, the module below says how it is answered
export const getUser = createCommand<string, Promise<User>>("user/get");
// a job: a command that sends its outcome on as an event
export const loadUser = createJob("user/load", fetchUser, { done: userLoaded });
// a command that carries its handler: a module only has to bring it
export const saveUser = createCommand("user/save", (user: User) => user.id);

export const userModule = createModule<Events>("user", (m) => {
	// registered for as long as the module is mounted, removed with it
	m.handle(getUser, (id, { signal }) => fetchUser(id, { signal }));
	m.use(saveUser); // listed, with no handler written again
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

export const user = bus.emit(getUser, "1"); // answered by the handler of the module
export const unmount = app.mount(
	createModule<Events>("audit", (m) => {
		m.on(userLoaded, (loaded) => console.log("audit", loaded.id));
	}),
);
