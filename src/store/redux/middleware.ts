import type { Bus } from "../../core/bus";
import type { EventMap } from "../../core/types";

/** What Redux passes through a middleware: an action is a plain object with a `type`. */
type ReduxAction = { type: string; payload?: unknown };

export type NanoeffectsMiddlewareOptions = {
	/** Return `false` for the actions that the bus should not get. Default: all of them. */
	filter?: (action: ReduxAction) => boolean;
};

const isAction = (value: unknown): value is ReduxAction =>
	typeof value === "object" && value !== null && "type" in value;

/**
 * A Redux middleware that sends every action to the bus, after the reducers
 * have handled it, so a handler that reads the store sees the new state. It
 * does not depend on Redux: it only has the shape of a middleware. Values that
 * are not plain actions (the functions of redux-thunk) go through untouched.
 *
 * The other way needs no adapter: give the store to the tasks with
 * `createBus({ context: { store } })` and dispatch from a handler.
 *
 * Take care of loops: a handler must not dispatch the action it handles.
 * Errors of handlers reach the caller of `dispatch`, as for `bus.emit`; set
 * `onError` on the bus to isolate them.
 *
 * @example
 * ```ts
 * const store = configureStore({
 *   reducer,
 *   middleware: (getDefault) => getDefault().concat(nanoeffectsMiddleware(bus)),
 * });
 *
 * bus.on(userRequested, latest(async (id, { store, signal }) => {
 *   store.dispatch(userLoaded(await fetchUser(id, { signal })));
 * }));
 * ```
 */
export const nanoeffectsMiddleware = <E extends EventMap>(
	bus: Bus<E>,
	options: NanoeffectsMiddlewareOptions = {},
) => {
	// the bus is typed for its own events; an action of a store can be any
	const emit = bus.emit as (action: ReduxAction) => unknown;

	return () => (next: (action: unknown) => unknown) => (action: unknown) => {
		const result = next(action);
		if (isAction(action) && (options.filter?.(action) ?? true)) {
			emit(action);
		}

		return result;
	};
};
