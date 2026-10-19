// Redux recipe — actions from Redux Toolkit; nanoeffects only supplies the middleware + policies.
// Prefer the JS snippet in docs/stores.md. This file is .ts for `pnpm tsgo`.
import { createAction } from "@reduxjs/toolkit";
import type { WithContext } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { createEffectsMiddleware, type ReduxStoreApi } from "nanoeffects/redux";

declare const fetchUser: (
	id: string,
	options: { signal: AbortSignal },
) => Promise<string>;

// RTK action creators (or take them from createSlice(...).actions)
const userRequested = createAction<string>("user/requested");
const userLoaded = createAction<string>("user/loaded");

// --- Typing for the checker only (skip in JavaScript) ---
// RootState — your Redux state shape (for getState).
type RootState = { user: string | null };
// Events — bus event name → payload (same strings as the RTK actions).
// WithContext — checker-only: tasks also have ctx.store. Middleware attaches store at runtime.
type Events = {
	"user/requested": string;
	"user/loaded": string;
} & WithContext<{ store: ReduxStoreApi<RootState> }>;
// --- end typing ---

// bus + middleware: actions reach the bus after reducers; tasks get ctx.store
export const effects = createEffectsMiddleware<Events>();

// configureStore({ reducer, middleware: (get) => get().concat(effects.middleware) })

// latest — a newer run aborts the older one (nanoeffects/policies)
effects.bus.on(
	userRequested,
	latest(async (id, { store, signal }) => {
		const user = await fetchUser(id, { signal });
		store.dispatch(userLoaded(user));
	}),
);
