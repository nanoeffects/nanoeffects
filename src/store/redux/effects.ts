import { type Bus, type BusOptions, createBus } from "../../core/bus";
import type { EventMap } from "../../core/types";
import { report } from "../../utils";
import {
	type NanoeffectsMiddlewareOptions,
	nanoeffectsMiddleware,
} from "./middleware";

/** What Redux gives a middleware: the parts of the store that it may use. */
export type ReduxStoreApi<State = unknown> = {
	dispatch: (action: never) => unknown;
	getState: () => State;
};

export type EffectsMiddlewareOptions<E extends EventMap> = Omit<
	BusOptions<E>,
	"context"
> &
	NanoeffectsMiddlewareOptions & {
		/** More fields for the context of every task, next to `store`. */
		context?: object;
	};

/**
 * Creates a bus and the Redux middleware that feeds it: the effects of an app
 * in one place, without sagas. Every task gets `ctx.store`, the `dispatch` and
 * `getState` of the store, as soon as the middleware is added to it. Declare
 * its type once:
 *
 * ```ts
 * declare global {
 *   interface NanoeffectsContext {
 *     store: ReduxStoreApi<RootState>;
 *   }
 * }
 * ```
 *
 * Two things are looked after for you:
 *
 * - **A handler does not loop on its own action.** An action that a handler
 *   dispatches through `ctx.store` and that has the type the handler works on
 *   does not go back to the bus (a handler of `a` that dispatches `a`). Other
 *   handlers of that type do not get it either. Longer cycles, `a` to `b` to
 *   `a`, are yours to avoid.
 * - **A failing handler does not break `dispatch`.** Errors go to `onError`,
 *   by default to `console.error`, as in Redux Toolkit listeners; reducers
 *   still throw to the caller.
 *
 * @example
 * ```ts
 * const effects = createEffectsMiddleware<Events>();
 *
 * const store = configureStore({
 *   reducer,
 *   middleware: (getDefault) => getDefault().concat(effects.middleware),
 * });
 *
 * effects.bus.on(userRequested, latest(async (id, { store, signal }) => {
 *   store.dispatch(userLoaded(await fetchUser(id, { signal })));
 * }));
 * ```
 */
export const createEffectsMiddleware = <E extends EventMap = EventMap>(
	options: EffectsMiddlewareOptions<E> = {},
) => {
	const { filter, context, onError, ...busOptions } = options;
	let api: ReduxStoreApi | undefined;
	// the type of the task that dispatched an action, without marking the action
	const origins = new WeakMap<object, string>();

	// each task gets its own `store`, which knows which task dispatches
	const contextOf = (task: { type: string }): NanoeffectsContext => {
		const fields: object = {
			...context,
			store: api && {
				getState: api.getState,
				dispatch: (action: unknown) => {
					if (typeof action === "object" && action !== null) {
						origins.set(action, task.type);
					}
					// the store types its own actions; here any action goes through
					const forwarded = action as never;
					return api?.dispatch(forwarded);
				},
			},
		};

		return fields as NanoeffectsContext;
	};

	const bus: Bus<E> = createBus<E>({
		...busOptions,
		onError:
			onError ??
			((error, { type }) => {
				report(`handler of "${type}" failed`, error);
			}),
		context: contextOf,
	});
	const forward = nanoeffectsMiddleware(bus, {
		filter: (action) =>
			origins.get(action) !== action.type && (filter?.(action) ?? true),
	});

	return {
		bus,
		middleware: (storeApi: ReduxStoreApi) => {
			api = storeApi;
			return forward();
		},
	};
};
