import type { Bus } from "../../core/bus";
import type { EventMap } from "../../core/types";
import {
	type NanoeffectsMiddlewareOptions,
	nanoeffectsMiddleware,
} from "./middleware";

/** What Redux gives a middleware: the parts of the store that it may use. */
export type ReduxStoreApi<State = unknown> = {
	dispatch: (action: { type: string; payload?: unknown }) => unknown;
	getState: () => State;
};

export type EffectsMiddlewareOptions = Pick<
	NanoeffectsMiddlewareOptions,
	"filter" | "traceId" | "traceGroupId"
>;

/**
 * Makes the Redux middleware that feeds a bus you already have: the actions of
 * the store reach its handlers, and every task gets `ctx.store`, the `dispatch`
 * and `getState` of the store, as soon as Redux has installed the middleware.
 * Type it in the event map of the bus:
 *
 * ```ts
 * type Events = { userRequested: string } & WithContext<{ store: ReduxStoreApi<RootState> }>;
 * ```
 *
 * Use one bus for one store: a second store would replace the first in the
 * contexts. Two things are looked after for you:
 *
 * - **A handler does not loop on its own action.** An action that a handler
 *   dispatches through `ctx.store` and that has the type the handler works on
 *   does not go back to the bus (a handler of `a` that dispatches `a`). Other
 *   handlers of that type do not get it either. Longer cycles, `a` to `b` to
 *   `a`, are yours to avoid.
 * - **A failing handler does not break `dispatch`.** With `onError` on the bus
 *   the bus isolates the handlers. Without it the error is written to
 *   `console.error`, as in Redux Toolkit listeners. Reducers still throw to
 *   the caller.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>();
 *
 * const store = configureStore({
 *   reducer,
 *   middleware: (getDefault) => getDefault().concat(createEffectsMiddleware(bus)),
 * });
 *
 * bus.on(userRequested, latest(async (id, { store, signal }) => {
 *   store.dispatch(userLoaded(await fetchUser(id, { signal })));
 * }));
 * ```
 */
export const createEffectsMiddleware = <E extends EventMap>(
	bus: Bus<E>,
	options: EffectsMiddlewareOptions = {},
) => {
	let api: ReduxStoreApi | undefined;
	// the type of the task that dispatched an action, without marking the action
	const origins = new WeakMap<object, string>();

	// each task gets its own `store`, which knows which task dispatches
	const previous = bus.addContext;
	bus.addContext = (ctx) => {
		previous?.(ctx);
		const current = api;
		if (!current) {
			return;
		}
		const { type } = ctx as { type: string };
		Object.assign(ctx, {
			store: {
				getState: current.getState,
				dispatch: (action: unknown) => {
					if (typeof action === "object" && action !== null) {
						origins.set(action, type);
					}
					// the store types its own actions; here any action goes through
					const forwarded = action as never;
					return current.dispatch(forwarded);
				},
			},
		});
	};

	const forward = nanoeffectsMiddleware(bus, {
		...(options.traceId === void 0 ? {} : { traceId: options.traceId }),
		...(options.traceGroupId === void 0
			? {}
			: { traceGroupId: options.traceGroupId }),
		filter: (action) =>
			origins.get(action) !== action.type && (options.filter?.(action) ?? true),
		// without an `onError` on the bus, `emit` throws the first error of a handler. Written as
		// `report` does it, but not imported: from this entry `report` moves into a chunk of its
		// own, and the bundle of `createBus` grows by 3 B (see the size limit).
		onError: (error, { type }) => {
			globalThis.console?.error(
				`[nanoeffects] handler of "${type}" failed`,
				error,
			);
		},
	});

	return (storeApi: ReduxStoreApi) => {
		api = storeApi;
		return forward();
	};
};
