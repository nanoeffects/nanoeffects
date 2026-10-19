// Hot reload: modules are replaced by name; the bus and the app live across reloads.
import { type Bus, createBus } from "nanoeffects";
import {
	createModule,
	type ModuleApi,
	registerModules,
} from "nanoeffects/actions";

type Events = { login: string };

const hot = import.meta.hot;

// made once, kept in `hot.data` across reloads
export const bus: Bus<Events> = hot?.data.bus ?? createBus<Events>();
export const app: ModuleApi<Events> = hot?.data.app ?? registerModules(bus);
if (hot) {
	hot.data.bus = bus;
	hot.data.app = app;
}

export const userModule = createModule<Events>("user", (m) => {
	m.on("login", (name) => console.log(`hello ${name}`));
});

app.mount(userModule);

// on reload the new version of this file mounts its module again, replacing the old "user"
hot?.accept("./hmr", (next) => next && app.mount(next.userModule));
