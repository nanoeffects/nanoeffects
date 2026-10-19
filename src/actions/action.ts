import type {
	ActionCreator,
	Free,
	FreeActionCreator,
} from "../core/action-creator";

export type { ActionCreator, FreeActionCreator };

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
