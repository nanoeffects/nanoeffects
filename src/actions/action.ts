import type { WithPayload } from "../core/bus";
import type { PayloadOf } from "../core/types";

// A `void` payload is an absent one, and an absent payload is `undefined` in
// an object, which is what the bus expects of an event without data.
// biome-ignore lint/suspicious/noConfusingVoidType: `void` is what is detected
type Absent<P> = [P] extends [void] ? undefined : P;

// The action of a creator, as an event of the bus sees it.
type Made<P, T extends string> = WithPayload<{ [K in T]: Absent<P> }, T>;

// only the type of this key is used: it marks "the payload type was not given"
declare const free: unique symbol;
type Free = typeof free;

/**
 * A creator whose payload type was not given: each call has the type of what
 * it is given, and the bus checks it against its event map, so
 * `createAction("user/loaded")` needs no generics and keeps its literal type.
 */
export interface FreeActionCreator<T extends string> {
	(): { type: T; payload: undefined };
	<P>(payload: P): { type: T; payload: P };
	readonly type: T;
	/** Tells whether an action is one of this creator. */
	match(action: { type: string; payload?: unknown }): action is {
		type: T;
		payload: unknown;
	};
	toString(): T;
}

/**
 * Makes actions of one type. It also works as the event of that type:
 * `bus.on(creator, fn)` and `bus.emit(creator(payload))`.
 */
export interface ActionCreator<
	P = void,
	T extends string = string,
	A extends unknown[] = PayloadOf<P>,
> {
	(...args: A): Made<P, T>;
	readonly type: T;
	/** Tells whether an action is one of this creator, and narrows its type. */
	match(action: { type: string; payload?: unknown }): action is Made<P, T>;
	toString(): T;
}

/**
 * Creates an action creator, as in Redux Toolkit.
 *
 * - `createAction("user/loaded")` needs no generics: the payload type comes
 *   from the event map of the bus that the action goes to, and the literal
 *   type of the action is kept.
 * - `createAction<User>("user/loaded")` gives the payload type, for a bus
 *   without an event map or to check the calls of the creator. The type of
 *   the action is then `string`; to keep the literal, give it as the second
 *   generic: `createAction<User, "user/loaded">("user/loaded")`.
 * - With `prepare` the arguments of the creator can differ from the payload,
 *   and both types are inferred.
 *
 * @example
 * ```ts
 * const added = createAction<number>("counter/added");
 * added(2); // { type: "counter/added", payload: 2 }
 * added.type; // "counter/added"
 * added.match(action); // true for actions of this type
 *
 * const renamed = createAction("user/renamed", (id: string, name: string) => ({
 *   payload: { id, name },
 * }));
 *
 * bus.emit(added(2));
 * bus.on(added, (n) => console.log(n));
 * ```
 */
export function createAction<P = Free, T extends string = string>(
	type: T,
): [P] extends [Free] ? FreeActionCreator<T> : ActionCreator<P, T>;
export function createAction<A extends unknown[], P, T extends string = string>(
	type: T,
	prepare: (...args: A) => { payload: P },
): ActionCreator<P, T, A>;
export function createAction(
	type: string,
	prepare?: (...args: unknown[]) => { payload: unknown },
): ActionCreator<unknown, string, unknown[]> | FreeActionCreator<string> {
	const creator = (...args: unknown[]) => ({
		type,
		payload: prepare ? prepare(...args).payload : args[0],
	});

	return Object.assign(creator, {
		type,
		match: (action: {
			type: string;
			payload?: unknown;
		}): action is { type: string; payload?: unknown } => action.type === type,
		toString: () => type,
	});
}
