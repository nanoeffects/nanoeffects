// Effects for a Redux store: the actions go to the bus, tasks get `ctx.store`.
import type { WithContext } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { latest } from "nanoeffects/policies";
import { createEffectsMiddleware, type ReduxStoreApi } from "nanoeffects/redux";

type RootState = { user: string | null };
type Events = {
	"user/requested": string;
	"user/loaded": string;
} & WithContext<{ store: ReduxStoreApi<RootState> }>;

declare const fetchUser: (
	id: string,
	options: { signal: AbortSignal },
) => Promise<string>;

const userRequested = createAction("user/requested");
const userLoaded = createAction("user/loaded");

export const effects = createEffectsMiddleware<Events>();

// pass it to the store: configureStore({ reducer, middleware: (get) => get().concat(effects.middleware) })

effects.bus.on(
	userRequested,
	latest(async (id, { store, signal }) => {
		if (store.getState().user === id) {
			return;
		}
		store.dispatch(userLoaded(await fetchUser(id, { signal })));
	}),
);
