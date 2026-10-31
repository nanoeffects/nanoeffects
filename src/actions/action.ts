import type {
	ActionCreator,
	Call,
	Free,
	FreeActionCreator,
} from "../core/action-creator";
import type { Scope, WithScope } from "../core/scope-types";
import type { EventMap, PayloadOf, Task } from "../core/types";
import type { FieldsOfScope, Scoped } from "../scope/types";
import { carry } from "./carry";
import {
	buildCommand,
	type MadeCommand,
	type Prepare,
	type ScopedCommand,
} from "./command";

export type { ActionCreator, FreeActionCreator };

// the fields that `createAction` reads out of its options object; the rest is the scope
type Reserved = "handle" | "prepare";

// what the creator is for an action of payload type `P`: a `Call` carries a result type as well
type Made<P, T extends string> = [P] extends [Free]
	? FreeActionCreator<T>
	: [P] extends [Call<infer Q, infer R>]
		? MadeCommand<Q, R, T>
		: ActionCreator<P, T>;

// the creator of an action that has a scope: its calls carry the fields of that scope
type ScopedCreator<P, T extends string, F> = [P] extends [Free]
	? FreeActionCreator<T, F> & WithScope<F>
	: ActionCreator<P, T, PayloadOf<P>, F> & WithScope<F>;

// the scope of an options object: everything but `handle` and `prepare`
type ScopeOf<S> = Omit<S, Reserved>;

// a command whose calls take the arguments of `prepare`
type PreparedCommand<P, R, T extends string, A extends unknown[], F> = ((
	...args: A
) => ReturnType<MadeCommand<P, R, T>> & WithScope<F>) &
	Omit<MadeCommand<P, R, T>, never> &
	WithScope<F>;

/**
 * Creates an action creator, as in Redux Toolkit. With a handler it makes a
 * command: `bus.emit(getUser("1"))` runs the handler and returns its result.
 *
 * - `createAction("user/loaded")` needs no generics: the payload type comes
 *   from the event map of the bus that the action goes to, and the literal
 *   type of the action is kept. An action with no handler is an event.
 * - `createAction<User>("user/loaded")` gives the payload type, for a bus
 *   without an event map or to check the calls of the creator. The type of
 *   the action is then `string`; to keep the literal, give it as the second
 *   generic: `createAction<User, "user/loaded">("user/loaded")`.
 * - `createAction<Call<Mail, void>>("mail/send")` also says what a handler
 *   bound later returns; see `Call`.
 * - A function as the second argument is the handler: it gets the payload and
 *   the context of the task, and `emit` returns what it returns. It can be
 *   wrapped in a policy, e.g. `latest(fn)`. A handler bound for the type in
 *   `actionsPlugin` wins over it.
 * - The options object, as the second argument or the third after a handler,
 *   is `{ handle, prepare, ...scope }`: `handle` is the handler, `prepare`
 *   builds the payload from several arguments (both types are inferred), and
 *   every other field is the scope. A scope as the last argument,
 *   `{ cache, $effects: { race } }`, puts those fields on the context of the
 *   handler and of the listeners of its calls; it works on a bus that uses
 *   `scopePlugin` from `nanoeffects/scope` and is ignored on any other.
 *
 * @example
 * ```ts
 * const added = createAction<number>("counter/added");
 * added(2); // { type: "counter/added", payload: 2 }
 * added.type; // "counter/added"
 * added.match(action); // true for actions of this type
 *
 * const renamed = createAction("user/renamed", {
 *   prepare: (id: string, name: string) => ({ payload: { id, name } }),
 * });
 *
 * const getUser = createAction("user/get", (id: string, { signal }) =>
 *   fetchUser(id, { signal }),
 * );
 * const user = await bus.emit(getUser("1"));
 *
 * bus.emit(added(2));
 * bus.on(added, (n) => console.log(n));
 * ```
 */
export function createAction<P = Free, T extends string = string>(
	type: T,
): Made<P, T>;
export function createAction<
	P = void,
	R = void,
	T extends string = string,
	E extends EventMap = EventMap,
>(type: T, handler: Task<P, E, R>): MadeCommand<P, R, T>;
export function createAction<
	P,
	R,
	A extends unknown[],
	T extends string,
	S extends Scope = Record<never, never>,
>(
	type: T,
	handler: Task<P, Scoped<EventMap, ScopeOf<S>>, R>,
	options: { prepare: (...args: A) => { payload: P } } & S,
): PreparedCommand<P, R, T, A, FieldsOfScope<EventMap, ScopeOf<S>>>;
export function createAction<
	P,
	R,
	A extends unknown[],
	T extends string,
	S extends Scope = Record<never, never>,
>(
	type: T,
	options: {
		handle: Task<P, Scoped<EventMap, ScopeOf<S>>, R>;
		prepare: (...args: A) => { payload: P };
	} & S,
): PreparedCommand<P, R, T, A, FieldsOfScope<EventMap, ScopeOf<S>>>;
export function createAction<
	P,
	R,
	T extends string,
	S extends Scope = Record<never, never>,
>(
	type: T,
	handler: Task<P, Scoped<EventMap, S>, R>,
	scope: S,
): ScopedCommand<P, R, T, FieldsOfScope<EventMap, S>>;
export function createAction<
	P,
	R,
	T extends string,
	S extends Scope = Record<never, never>,
>(
	type: T,
	options: { handle: Task<P, Scoped<EventMap, ScopeOf<S>>, R> } & S,
): ScopedCommand<P, R, T, FieldsOfScope<EventMap, ScopeOf<S>>>;
export function createAction<
	A extends unknown[],
	P,
	T extends string,
	S extends Scope = Record<never, never>,
>(
	type: T,
	options: { prepare: (...args: A) => { payload: P } } & S,
): ActionCreator<P, T, A, FieldsOfScope<EventMap, ScopeOf<S>>> &
	WithScope<FieldsOfScope<EventMap, ScopeOf<S>>>;
export function createAction<
	P = Free,
	T extends string = string,
	S extends Scope = Record<never, never>,
>(type: T, scope: S): ScopedCreator<P, T, FieldsOfScope<EventMap, S>>;
export function createAction(
	type: string,
	second?: Handler | Options,
	third?: Options,
): unknown {
	const given = typeof second === "function" ? third : second;
	const { handle, prepare, scope } = split(given);
	const handler = typeof second === "function" ? second : handle;

	if (handler) {
		return buildCommand(type, handler, scope, prepare);
	}

	const creator = (...args: unknown[]) => {
		const built: { payload: unknown } | undefined =
			prepare && Reflect.apply(prepare, null, args);

		return carry({ type, payload: built ? built.payload : args[0] }, scope);
	};

	return Object.assign(carry(creator, scope), {
		type,
		match: (action: { type: string; payload?: unknown }) =>
			action.type === type,
		toString: () => type,
	});
}

type Handler = Task<unknown, EventMap, unknown>;
type Options = Scope & { handle?: unknown; prepare?: unknown };

// takes `handle` and `prepare` out of an options object; what is left is the scope, as it was when there was nothing to take
const split = (
	options: Options | undefined,
): { handle?: Handler; prepare?: Prepare; scope?: Scope } => {
	if (!options) {
		return {};
	}
	const { handle, prepare, ...rest } = options;
	const hasHandle = typeof handle === "function";
	const hasPrepare = typeof prepare === "function";
	if (!hasHandle && !hasPrepare) {
		return { scope: options };
	}
	const scope = Object.keys(rest).length > 0 ? rest : void 0;

	return {
		...(hasHandle && { handle: handle as Handler }),
		...(hasPrepare && { prepare: prepare as Prepare }),
		...(scope && { scope }),
	};
};
