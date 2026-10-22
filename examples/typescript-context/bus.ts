// The bus of the app with a store on every ctx, and the names of its types for the other files.
import {
	type Context,
	contextPlugin,
	createBus,
	type EventsOf,
} from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { effectsPlugin, race } from "nanoeffects/effects";

export type User = { id: string; name: string };
export type Store = {
	fetchUser(id: string, options: { signal: AbortSignal }): Promise<User>;
	remember(user: User): void;
};

// Event name → payload; nothing about `ctx` is written here
type Events = { "user/loaded": User };

const store: Store = {
	fetchUser: async (id) => ({ id, name: "Eva" }),
	remember: () => {},
};

// createBus — the bus
// contextPlugin — puts `store` on every ctx; its type comes from the value
// effectsPlugin — puts `race` on every ctx
export const bus = createBus<Events>()
	.use(contextPlugin({ store }))
	.use(effectsPlugin({ race }));

// modulePlugin — the app of the bus: mounts modules and creates them with the types of the bus.
// No modules yet: the module files need `app` first, and main.ts mounts them.
export const app = bus.use(modulePlugin());

// createModule of this app: the library function with the types of the bus.
// A module file imports it from here and writes no types.
export const { createModule } = app;

// EventsOf — the event map of `bus` with the fields the plugin added
export type AppEvents = EventsOf<typeof bus>;
// The context of a handler of this bus: has `store` and `race`
export type AppContext = Context<AppEvents>;
