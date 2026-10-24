import type {
	ActionCreator,
	Free,
	FreeActionCreator,
} from "../core/action-creator";
import type { Scope, WithScope } from "../core/scope-types";
import type { EventMap, PayloadOf } from "../core/types";
import type { FieldsOfScope } from "../scope/types";
import { carry } from "./carry";

export type { ActionCreator, FreeActionCreator };

// the creator of an action that has a scope: its calls carry the fields of that scope
type ScopedCreator<P, T extends string, F> = [P] extends [Free]
	? FreeActionCreator<T, F> & WithScope<F>
	: ActionCreator<P, T, PayloadOf<P>, F> & WithScope<F>;

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
 * - A scope as the last argument, `{ cache, effects: { race } }`, gives the
 *   listeners of its calls those context fields; it works on a bus that uses `scopePlugin`
 *   from `nanoeffects/scope` and is ignored on any other.
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
export function createAction<
	P = Free,
	T extends string = string,
	S extends Scope = Record<never, never>,
>(type: T, scope: S): ScopedCreator<P, T, FieldsOfScope<EventMap, S>>;
export function createAction<
	A extends unknown[],
	P,
	T extends string,
	S extends Scope,
>(
	type: T,
	prepare: (...args: A) => { payload: P },
	scope: S,
): ActionCreator<P, T, A, FieldsOfScope<EventMap, S>> &
	WithScope<FieldsOfScope<EventMap, S>>;
export function createAction(
	type: string,
	prepareOrScope?: ((...args: unknown[]) => { payload: unknown }) | Scope,
	maybeScope?: Scope,
): ActionCreator<unknown, string, unknown[]> | FreeActionCreator<string> {
	const prepare =
		typeof prepareOrScope === "function" ? prepareOrScope : void 0;
	const scope =
		typeof prepareOrScope === "function" ? maybeScope : prepareOrScope;
	const creator = (...args: unknown[]) =>
		carry(
			{
				type,
				payload: prepare ? prepare(...args).payload : args[0],
			},
			scope,
		);

	return Object.assign(carry(creator, scope), {
		type,
		match: (action: {
			type: string;
			payload?: unknown;
		}): action is { type: string; payload?: unknown } => action.type === type,
		toString: () => type,
	});
}
