// One feature in its own file: a command with its handler, and the module that mounts it.
import { createCommand } from "nanoeffects/actions";
import { type AppContext, createModule } from "./bus";

// createCommand — the payload comes from `id: string`, the result from the body.
// `ctx: AppContext` is there to read `store`; `signal` needs no annotation.
export const getUser = createCommand(
	"user/get",
	(id: string, { store, signal }: AppContext) =>
		store.fetchUser(id, { signal }),
);

// createModule from bus.ts — handlers of the module see the context fields of the bus
export const userModule = createModule("user", (m) => {
	m.use(getUser); // bind the handler the command carries, while the module is mounted
	m.on("user/loaded", (user, { store }) => store.remember(user));
});
