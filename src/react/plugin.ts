import { useEffect, useRef, useState } from "react";
import type { ActionCreator, FreeActionCreator } from "../core/action-creator";
import type { Bus, EventKey, EventLike } from "../core/bus";
import { type Origin, type OriginOptions, originKey } from "../core/origin-key";
import type { EventMap } from "../core/types";

/** Tells whether two values are the same: `Object.is` unless the caller gives another. */
export type Equals<V> = (previous: V, next: V) => boolean;

/** The third argument of `useEmitter`. */
export type UseEmitterOptions<V> = OriginOptions & {
	/** Tells whether a new value is the same as the previous one; `Object.is` when absent. */
	equals?: Equals<V>;
};

/** What `reactPlugin` adds to the bus. */
export type ReactApi<E extends EventMap> = {
	/**
	 * A React hook: after a render commits with a `value` that differs from the
	 * previous one (`Object.is`, or the `equals` you pass), emits `event` with it. It does not emit on mount,
	 * not twice under StrictMode, and not for an equal value. Changes before one
	 * commit emit once, with the last value. The method does not read `this`, so
	 * `export const { useEmitter } = bus` gives a free hook.
	 */
	useEmitter: {
		<K extends EventKey<E>>(
			event: K,
			value: E[K],
			options?: UseEmitterOptions<E[K]>,
		): void;
		/** A creator without a payload type: the payload comes from the event map. */
		<K extends EventKey<E>>(
			creator: FreeActionCreator<K>,
			value: E[K],
			options?: UseEmitterOptions<E[K]>,
		): void;
		<P, T extends string>(
			creator: ActionCreator<P, T>,
			value: P,
			options?: UseEmitterOptions<P>,
		): void;
	};

	/**
	 * A React hook with the signature of `useState`: returns `[state, setState]`, and
	 * every emit of `event` sets the state to its payload while the component is
	 * mounted. `initial` may be a function, as in `useState`. The bus keeps no values,
	 * so an event emitted before the first commit is not seen: read a current value
	 * into `initial` when that matters. The method does not read `this`, so
	 * `export const { useEventState } = bus` gives a free hook.
	 *
	 * @example
	 * ```tsx
	 * const [found, setFound] = useEventState(searchLoaded, []); // [] until the first searchLoaded
	 * ```
	 */
	useEventState: {
		<K extends EventKey<E>, S>(
			event: K,
			initial: StateOf<E[K], S> | (() => StateOf<E[K], S>),
		): EventState<StateOf<E[K], S>>;
		/** A creator without a payload type: the payload comes from the event map. */
		<K extends EventKey<E>, S>(
			creator: FreeActionCreator<K>,
			initial: StateOf<E[K], S> | (() => StateOf<E[K], S>),
		): EventState<StateOf<E[K], S>>;
		<P, T extends string>(
			creator: ActionCreator<P, T>,
			initial: P | (() => P),
		): EventState<P>;
	};
};

/** What `useEventState` returns: the pair of `useState`, with the payload of the event as state. */
export type EventState<P> = [P, (next: P | ((previous: P) => P)) => void];

// `[]` is `never[]` to TypeScript, which nothing can be read from
type Widen<S> = [S] extends [never[]] ? unknown[] : S;

// the payload type when the event has one; otherwise the type of `initial`
type StateOf<P, S> = unknown extends P ? Widen<S> : P;

type Creator = (...args: never[]) => { type: string; payload?: unknown };

/**
 * Adds `bus.useEmitter(event, value)`: a hook that tells the bus when a value of
 * a component changes, without the traps of `useEffect(() => emit(value), [value])`
 * (an emit on mount, two on mount under StrictMode, a new `emit` re-running it).
 * Pass `{ equals }` as the third argument for values that `Object.is` tells apart
 * although they are the same, such as a new object with the same fields. `{ traceId }`
 * names the subscription and `{ traceGroupId }` the flow in the trace of the bus.
 * Needs `react` 18 or newer. Returns the same bus.
 *
 * @example
 * ```tsx
 * import { createBus } from "nanoeffects";
 * import { createAction } from "nanoeffects/actions";
 * import { reactPlugin } from "nanoeffects/react";
 *
 * export const bus = createBus().use(reactPlugin());
 * export const { useEmitter } = bus; // a free hook
 *
 * const nameChanged = createAction<string>("name/changed");
 * bus.on(nameChanged, (name) => console.log(name));
 *
 * const Profile = () => {
 *   const [name, setName] = useState("Adam");
 *   useEmitter(nameChanged, name); // nameChanged("…") on every change of name
 *   return <input value={name} onChange={(event) => setName(event.target.value)} />;
 * };
 * ```
 */
export const reactPlugin =
	() =>
	<E extends EventMap>(bus: Bus<E>): Bus<E> & ReactApi<E> => {
		function useEmitter<K extends EventKey<E>>(
			event: K,
			value: E[K],
			options?: UseEmitterOptions<E[K]>,
		): void;
		function useEmitter<K extends EventKey<E>>(
			creator: FreeActionCreator<K>,
			value: E[K],
			options?: UseEmitterOptions<E[K]>,
		): void;
		function useEmitter<P, T extends string>(
			creator: ActionCreator<P, T>,
			value: P,
			options?: UseEmitterOptions<P>,
		): void;
		function useEmitter(
			event: string | Creator,
			value: unknown,
			options?: UseEmitterOptions<never> | null,
		): void {
			// the previous value starts as the first one, so a mount, and the second run of
			// an effect under StrictMode, find nothing changed
			const previous = useRef(value);
			const latest = useRef({ event, options });

			// the newest event and options are read when the value changes; they are not
			// dependencies, so a new function on every render does not re-run the effect
			useEffect(() => {
				latest.current = { event, options };
			});

			useEffect(() => {
				const { event: target, options: given } = latest.current;
				const same = given?.equals ?? Object.is;
				// the overloads above check both values against `equals`; here they are only passed on
				const before = previous.current as never;
				const after = value as never;
				if (same(before, after)) {
					return;
				}
				previous.current = value;

				// the overloads above check the value; here it is only passed on
				const passed = value as never;
				const made =
					typeof target === "function"
						? target(passed)
						: { type: target, payload: value };
				const action = made as EventLike<E>;
				// `tracePlugin` puts the root of the trace on the bus; without it the event is emitted as it is
				const origin: Origin | undefined = Reflect.get(bus, originKey);
				if (origin) {
					origin(action, given ?? {});
				} else {
					bus.emit(action);
				}
			}, [value]);
		}

		function useEventState<K extends EventKey<E>, S>(
			event: K,
			initial: StateOf<E[K], S> | (() => StateOf<E[K], S>),
		): EventState<StateOf<E[K], S>>;
		function useEventState<K extends EventKey<E>, S>(
			creator: FreeActionCreator<K>,
			initial: StateOf<E[K], S> | (() => StateOf<E[K], S>),
		): EventState<StateOf<E[K], S>>;
		function useEventState<P, T extends string>(
			creator: ActionCreator<P, T>,
			initial: P | (() => P),
		): EventState<P>;
		function useEventState<S>(
			event: string | Creator,
			initial: S | (() => S),
		): EventState<S> {
			const [state, setState] = useState(initial);

			useEffect(() => {
				// the overloads above check the event; here it is only passed on
				const target = event as never;
				// `() => next` stores a function payload instead of calling it as an updater
				const listener = (payload: unknown) => {
					const next = payload as S;
					setState(() => next);
				};
				return bus.on(target, listener);
			}, [event]);

			return [state, setState];
		}

		return Object.assign(bus, { useEmitter, useEventState });
	};
