import type { ActionCreator, FreeActionCreator } from "../core/action-creator";
import type { Bus, EventKey, EventLike } from "../core/bus";
import type { EventMap, PayloadOf } from "../core/types";

/** What `emitterPlugin` adds to the bus. */
export type EmitterApi<E extends EventMap> = {
	/**
	 * Turns an action creator into a function that emits its action on this
	 * bus, to pass as a callback. The function takes what the creator takes.
	 */
	emitter: {
		/** A creator without a payload type: the payload comes from the event map. */
		<K extends EventKey<E>>(
			creator: FreeActionCreator<K>,
		): (...payload: PayloadOf<E[K]>) => void;
		<P, T extends string, A extends unknown[]>(
			creator: ActionCreator<P, T, A>,
		): (...args: A) => void;
	};
};

type Creator = (...args: never[]) => { type: string; payload?: unknown };

/**
 * Adds `bus.emitter(creator)`: a function that emits the action of `creator`
 * on this bus. Use it where something wants a callback, such as the
 * subscription of a state manager, instead of `(value) => bus.emit(creator(value))`.
 * The creator stays a plain `createAction`, so `bus.emit(creator(value))` and
 * `bus.on(creator, …)` work as before. Returns the same bus.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { createAction, emitterPlugin } from "nanoeffects/actions";
 *
 * const bus = createBus().use(emitterPlugin());
 * const nameChanged = createAction<string>("name/changed");
 * const emitNameChanged = bus.emitter(nameChanged);
 *
 * // nanostores: the store calls it with the new value
 * $name.listen(emitNameChanged);
 * ```
 */
export const emitterPlugin =
	() =>
	<E extends EventMap>(bus: Bus<E>): Bus<E> & EmitterApi<E> => {
		function emitter<K extends EventKey<E>>(
			creator: FreeActionCreator<K>,
		): (...payload: PayloadOf<E[K]>) => void;
		function emitter<P, T extends string, A extends unknown[]>(
			creator: ActionCreator<P, T, A>,
		): (...args: A) => void;
		function emitter(creator: Creator) {
			return (...args: unknown[]) => {
				// the overloads above check the arguments; here they are only passed on
				const given = args as never[];
				const action = creator(...given) as EventLike<E>;
				bus.emit(action);
			};
		}

		return Object.assign(bus, { emitter });
	};
