import type { Readable } from "svelte/store";
import { readable } from "svelte/store";
import type { ActionCreator, FreeActionCreator } from "../core/action-creator";
import type { Bus, EventKey } from "../core/bus";
import type { StateOf } from "../core/state-of";
import type { EventMap } from "../core/types";

/** What `sveltePlugin` adds to the bus. */
export type SvelteApi<E extends EventMap> = {
	/**
	 * A readable Svelte store: `initial` at first, then the payload of every emit of `event`.
	 * The bus listens only while something subscribes (the first subscriber starts it, the last
	 * one stops it), and the bus keeps no values, so an event emitted while nothing reads the
	 * store is lost. It is state of the components that read it, not a store of the app. A
	 * function payload is stored, not called. The method does not read `this`, so
	 * `export const { eventStore } = bus` gives a free function.
	 */
	eventStore: {
		<K extends EventKey<E>, S>(
			event: K,
			initial: StateOf<E[K], S>,
		): Readable<StateOf<E[K], S>>;
		/** A creator without a payload type: the payload comes from the event map. */
		<K extends EventKey<E>, S>(
			creator: FreeActionCreator<K>,
			initial: StateOf<E[K], S>,
		): Readable<StateOf<E[K], S>>;
		<P, T extends string>(
			creator: ActionCreator<P, T>,
			initial: P,
		): Readable<P>;
	};
};

type Creator = (...args: never[]) => { type: string; payload?: unknown };

/**
 * Adds `bus.eventStore(event, initial)`: an event of the bus as a Svelte store, so `$found` in
 * a component shows the last payload and Svelte subscribes and unsubscribes for you. The store
 * is not a store of the app: it keeps the last payload only while something reads it, and an
 * event that came before is lost. Keep a value that must outlive the component in a store of
 * your own. Needs `svelte` 5 or newer. Returns the same bus.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { createAction } from "nanoeffects/actions";
 * import { sveltePlugin } from "nanoeffects/svelte";
 *
 * export const bus = createBus().use(sveltePlugin());
 * export const { eventStore } = bus; // a free function
 *
 * const searchLoaded = createAction<string[]>("search/loaded");
 *
 * // in a component: `$found` is string[], set by every searchLoaded
 * const found = eventStore(searchLoaded, []);
 * ```
 */
export const sveltePlugin =
	() =>
	<E extends EventMap>(bus: Bus<E>): Bus<E> & SvelteApi<E> => {
		function eventStore<K extends EventKey<E>, S>(
			event: K,
			initial: StateOf<E[K], S>,
		): Readable<StateOf<E[K], S>>;
		function eventStore<K extends EventKey<E>, S>(
			creator: FreeActionCreator<K>,
			initial: StateOf<E[K], S>,
		): Readable<StateOf<E[K], S>>;
		function eventStore<P, T extends string>(
			creator: ActionCreator<P, T>,
			initial: P,
		): Readable<P>;
		function eventStore<S>(event: string | Creator, initial: S): Readable<S> {
			// the overloads above check the event; here it is only passed on
			const target = event as never;
			// `readable` runs this at the first subscriber and the function it returns at the last;
			// `bus.on` returns the function that stops listening
			return readable(initial, (set) => bus.on(target, set));
		}

		return Object.assign(bus, { eventStore });
	};
