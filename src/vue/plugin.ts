import type { ShallowRef, WatchSource, WatchStopHandle } from "vue";
import { onScopeDispose, shallowRef, watch } from "vue";
import type { ActionCreator, FreeActionCreator } from "../core/action-creator";
import type { Bus, EventKey, EventLike } from "../core/bus";
import { type Origin, type OriginOptions, originKey } from "../core/origin-key";
import type { StateOf } from "../core/state-of";
import type { EventMap } from "../core/types";

/** Tells whether two values are the same. */
export type Equals<V> = (previous: V, next: V) => boolean;

/** The third argument of `watchEmitter`. */
export type WatchEmitterOptions<V> = OriginOptions & {
	/** Tells whether a new value is the same as the previous one, for a new object with the same fields. */
	equals?: Equals<V>;
};

/** What `vuePlugin` adds to the bus. */
export type VueApi<E extends EventMap> = {
	/**
	 * Watches a ref or a getter and emits `event` with its new value when it changes. It
	 * does not emit when it is called, and it stops with the effect scope (a component) that
	 * called it. Like Vue's `watch`, it runs before the next render, so several changes in
	 * one tick emit once, with the last value. The method does not read `this`, so
	 * `export const { watchEmitter } = bus` gives a free function. It returns the function
	 * that stops it early.
	 */
	watchEmitter: {
		<K extends EventKey<E>>(
			source: WatchSource<E[K]>,
			event: K,
			options?: WatchEmitterOptions<E[K]>,
		): WatchStopHandle;
		/** A creator without a payload type: the payload comes from the event map. */
		<K extends EventKey<E>>(
			source: WatchSource<E[K]>,
			creator: FreeActionCreator<K>,
			options?: WatchEmitterOptions<E[K]>,
		): WatchStopHandle;
		<P, T extends string>(
			source: WatchSource<P>,
			creator: ActionCreator<P, T>,
			options?: WatchEmitterOptions<P>,
		): WatchStopHandle;
	};

	/**
	 * A ref that starts as `initial`, and that every emit of `event` sets to its payload
	 * while the effect scope (a component) that called it lives. A function payload is stored,
	 * not called. The bus keeps no values, so an event emitted before the call is not seen. It
	 * is state of one component, not a store. The method does not read `this`, so
	 * `export const { useEventRef } = bus` gives a free function.
	 */
	useEventRef: {
		<K extends EventKey<E>, S>(
			event: K,
			initial: StateOf<E[K], S>,
		): ShallowRef<StateOf<E[K], S>>;
		/** A creator without a payload type: the payload comes from the event map. */
		<K extends EventKey<E>, S>(
			creator: FreeActionCreator<K>,
			initial: StateOf<E[K], S>,
		): ShallowRef<StateOf<E[K], S>>;
		<P, T extends string>(
			creator: ActionCreator<P, T>,
			initial: P,
		): ShallowRef<P>;
	};
};

type Creator = (...args: never[]) => { type: string; payload?: unknown };

/**
 * Adds `bus.watchEmitter(source, event)` and `bus.useEventRef(event, initial)`: the two
 * jobs of a Vue component with the bus. `watchEmitter` tells the bus when a value of the
 * component changes, and `useEventRef` keeps the last payload of an event in a ref. Pass
 * `{ equals }` to `watchEmitter` for values that `Object.is` tells apart although they are
 * the same, and `{ traceId }` and `{ traceGroupId }` to name the subscription and the flow
 * in the trace of the bus. Needs `vue` 3.3 or newer. Returns the same bus.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { createAction } from "nanoeffects/actions";
 * import { vuePlugin } from "nanoeffects/vue";
 * import { ref } from "vue";
 *
 * export const bus = createBus().use(vuePlugin());
 * export const { watchEmitter, useEventRef } = bus; // free functions
 *
 * const nameChanged = createAction<string>("name/changed");
 * const nameSaved = createAction<string[]>("name/saved");
 *
 * // inside setup():
 * const name = ref("Adam");
 * watchEmitter(name, nameChanged); // nameChanged("…") on every change of name, not on mount
 * const saved = useEventRef(nameSaved, []); // Ref<string[]>, set by every nameSaved
 * ```
 */
export const vuePlugin =
	() =>
	<E extends EventMap>(bus: Bus<E>): Bus<E> & VueApi<E> => {
		function watchEmitter<K extends EventKey<E>>(
			source: WatchSource<E[K]>,
			event: K,
			options?: WatchEmitterOptions<E[K]>,
		): WatchStopHandle;
		function watchEmitter<K extends EventKey<E>>(
			source: WatchSource<E[K]>,
			creator: FreeActionCreator<K>,
			options?: WatchEmitterOptions<E[K]>,
		): WatchStopHandle;
		function watchEmitter<P, T extends string>(
			source: WatchSource<P>,
			creator: ActionCreator<P, T>,
			options?: WatchEmitterOptions<P>,
		): WatchStopHandle;
		function watchEmitter(
			source: WatchSource<unknown>,
			event: string | Creator,
			options?: WatchEmitterOptions<never> | null,
		): WatchStopHandle {
			// `watch` runs on a change and not when it is made, and stops with the scope that made it
			return watch(source, (value, previous) => {
				// the overloads above check the value against `equals`; here it is only passed on
				const before = previous as never;
				const after = value as never;
				if (options?.equals?.(before, after)) {
					return;
				}

				const made =
					typeof event === "function"
						? event(after)
						: { type: event, payload: value };
				const action = made as EventLike<E>;
				// `tracePlugin` puts the root of the trace on the bus; without it the event is emitted as it is
				const origin: Origin | undefined = Reflect.get(bus, originKey);
				if (origin) {
					origin(action, options ?? {});
				} else {
					bus.emit(action);
				}
			});
		}

		function useEventRef<K extends EventKey<E>, S>(
			event: K,
			initial: StateOf<E[K], S>,
		): ShallowRef<StateOf<E[K], S>>;
		function useEventRef<K extends EventKey<E>, S>(
			creator: FreeActionCreator<K>,
			initial: StateOf<E[K], S>,
		): ShallowRef<StateOf<E[K], S>>;
		function useEventRef<P, T extends string>(
			creator: ActionCreator<P, T>,
			initial: P,
		): ShallowRef<P>;
		function useEventRef<S>(
			event: string | Creator,
			initial: S,
		): ShallowRef<S> {
			// a shallow ref keeps the payload as it is, and a function payload is kept, not called
			const state = shallowRef(initial);

			// the overloads above check the event; here it is only passed on
			const target = event as never;
			const listener = (payload: unknown) => {
				const next = payload as S;
				state.value = next;
			};
			// `bus.on` returns the function that stops listening; run it when the scope ends
			onScopeDispose(bus.on(target, listener));

			return state;
		}

		return Object.assign(bus, { watchEmitter, useEventRef });
	};
