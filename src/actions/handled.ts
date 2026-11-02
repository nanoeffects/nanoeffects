import type { Actions, Bus, Context, Handled, HandledCall } from "../core/bus";
import { handledCall, makeHandledCall } from "../core/bus";
import { eventKey } from "../core/event";
import type { Scope, WithScope } from "../core/scope-types";
import type { EventMap, Task, UnsubscribeCallback } from "../core/types";
import type { FieldsOfScope, Scoped } from "../scope/types";
import { carry } from "./carry";

// what `bound` hands to the bus for a type: the handler is found again by `type` when it runs
const placeholder = (type: string): Handled => {
	const build = (payload: never) => makeHandledCall(handled, type, payload);
	const handled: Handled = Object.assign(build, { type });

	return handled;
};

/** Builds the payload of a call from the arguments of the creator, as `createAction` takes it in `prepare`. */
export type Prepare = (...args: never[]) => { payload: unknown };

// the context of a task has the signal and the `emit` of the bus: arguments of a creator do not
const isTaskContext = (value: unknown): value is Context<EventMap> =>
	typeof value === "object" &&
	value !== null &&
	Reflect.get(value, "signal") instanceof AbortSignal &&
	typeof Reflect.get(value, "emit") === "function";

/** Thrown when an action runs without a handler: a mistake of the program, not a failure of the work. */
export class MissingHandlerError extends Error {}

/** What `createAction` returns: an action that also tells whether an action is of its type. */
export type MadeHandled<P, R, T extends string> = Handled<P, R> & {
	readonly type: T;
	/** Tells whether an action has the type of this action, and narrows its type. */
	match(action: { type: string; payload?: unknown }): action is {
		type: T;
		payload: P;
	};
};

/** `Made`, called so that its calls carry the scope fields `F`; `Made` itself when there are none. */
export type CarryingCalls<Made, P, R, F> = [unknown] extends [F]
	? Made
	: ((payload: P) => HandledCall<P, R> & WithScope<F>) & Made & WithScope<F>;

/** An action made with a scope: its calls carry the fields of that scope, for the checker. */
export type ScopedHandled<P, R, T extends string, F> = ((
	payload: P,
) => HandledCall<P, R> & WithScope<F>) &
	MadeHandled<P, R, T> &
	WithScope<F>;

/**
 * Creates an action: a typed request for a result. Calling it builds
 * `{ type, payload }` like `createAction`. `bus.emit(action(payload))` (or
 * `bus.emit(action, payload)`) runs its handler as a task, with a context, and
 * returns what the handler returns. Listeners of the action's type are told
 * first, as for any event.
 *
 * The handler is optional. An action without one is only a contract, and the
 * bus gets its implementation from the `actions` registry (see
 * `actionsPlugin` and `Registry.handle`). A handler bound there wins over the one
 * the action was created with, so a test can give a bus its own implementation.
 *
 * A handler can be wrapped in a policy, e.g. `latest(fn)`.
 * `action.match(action)` tells whether an action has the type of the action,
 * as it does for an action creator.
 *
 * A scope as the third argument, `{ cache, $effects: { race } }`, puts those fields on
 * the context of the handler and of the listeners of the action; the handler
 * sees them typed. It works on a bus that uses `scopePlugin` from
 * `nanoeffects/scope` and is ignored on any other.
 *
 * @example
 * ```ts
 * const getUser = createAction("user/get", (id: string, { signal }) =>
 *   fetchUser(id, { signal }),
 * );
 * const sendMail = createAction<Mail, void>("mail/send"); // implemented elsewhere
 *
 * const bus = createBus<Events>();
 * const actions = bus.use(actionsPlugin());
 * actions.handle(sendMail, smtpSend);
 * const user = await bus.emit(getUser("1"));
 *
 * actions.handle(getUser, async () => fakeUser); // in a test
 * ```
 */
export function makeHandled<
	P = void,
	R = void,
	T extends string = string,
	E extends EventMap = EventMap,
>(type: T, handler?: Task<P, E, R>): MadeHandled<P, R, T>;
export function makeHandled<
	P,
	R,
	T extends string,
	S extends Scope = Record<never, never>,
>(
	type: T,
	handler: Task<P, Scoped<EventMap, S>, R> | undefined,
	scope: S,
): ScopedHandled<P, R, T, FieldsOfScope<EventMap, S>>;
export function makeHandled(
	type: string,
	handler?: Task<unknown, EventMap, unknown>,
	scope?: Scope,
): MadeHandled<unknown, unknown, string> {
	return buildHandled(type, handler, scope);
}

/** `makeHandled` with the loose types of the runtime, and `prepare`, which `createAction` also gives. */
export function buildHandled(
	type: string,
	handler?: Task<unknown, EventMap, unknown>,
	scope?: Scope,
	prepare?: Prepare,
): MadeHandled<unknown, unknown, string> {
	const match = (action: {
		type: string;
		payload?: unknown;
	}): action is { type: string; payload: unknown } => action.type === type;

	// The bus runs an action as `action(payload, ctx)`, and a user builds a call as
	// `action(...args)`. Without `prepare` a second object argument can only be the
	// context; with it the arguments are the user's own, so the context is known by what it has.
	const runs = (args: unknown[]) =>
		prepare
			? args.length === 2 && isTaskContext(args[1])
			: typeof args[1] === "object";

	function invoke(...args: unknown[]) {
		const [first, second] = args;
		if (runs(args)) {
			if (!handler) {
				throw new MissingHandlerError(`No handler for action "${type}"`);
			}
			const ctx = second as Context<EventMap>;

			return handler(first, ctx);
		}
		const built: { payload: unknown } | undefined =
			prepare && Reflect.apply(prepare, null, args);
		const payload = built ? built.payload : first;

		return carry(makeHandledCall(handled, type, payload), scope);
	}

	const made = Object.assign(invoke, {
		type,
		match,
		toString: () => type,
	}) as MadeHandled<unknown, unknown, string>;
	const handled = carry(made, scope);

	return handled;
}

/**
 * The handler an action that is not an action can have: any. An action
 * (a creator whose calls are calls of an action with a handler) is not accepted here, so its own
 * overload checks the handler against its payload and result.
 */
export type LooseHandler<A, E extends EventMap> = A extends (
	...args: never[]
) => { readonly [handledCall]: unknown }
	? never
	: Task<never, E, unknown>;

/** The registry of handlers that `actionsPlugin` returns: `run` for the bus, `handle` to bind more. */
export interface Registry<E extends EventMap> extends Actions {
	handle<P, R>(handled: Handled<P, R>, fn: Task<P, E, R>): UnsubscribeCallback;
	/** Also an action made without a handler: what is emitted for its type runs `fn` and returns its result. */
	handle<A extends { readonly type: string }>(
		action: A,
		fn: LooseHandler<A, E>,
	): UnsubscribeCallback;
	handle(type: string, fn: Task<never, E, unknown>): UnsubscribeCallback;
}

// the registry of an earlier `actionsPlugin`: `actions` with a `handle`, which a custom runner does not have
const isRegistry = <E extends EventMap>(
	actions: Actions | undefined,
): actions is Registry<E> =>
	typeof Reflect.get(actions ?? {}, "handle") === "function";

/**
 * The plugin that gives a bus the handlers bound to actions:
 * `bus.use(actionsPlugin())` makes the registry, sets it as the
 * actions of the bus and returns it. Each bus has its own, so each test can
 * have its own implementation. `handle` binds a handler and returns the
 * function that unbinds. A second `actionsPlugin` on the same bus returns the
 * registry that is there, so the order of the
 * plugins does not matter. A `actions` that is not such a registry (a custom
 * runner) is replaced.
 *
 * What the bus runs for an action: the handler bound last, else the one the
 * action was created with, else it throws `No handler for action "..."`.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>();
 * const actions = bus.use(actionsPlugin());
 * actions.handle(sendMail, smtpSend);
 *
 * const unbind = actions.handle(getUser, async () => fakeUser);
 * unbind(); // the action's own handler is back
 * ```
 */
export const actionsPlugin =
	<E extends EventMap>() =>
	(bus: Bus<E>): Registry<E> => {
		const existing = bus.actions;
		if (isRegistry<E>(existing)) {
			return existing;
		}

		const bound = new Map<string, Array<{ fn: Task<never, E, unknown> }>>();

		const bind = (type: string, fn: Task<never, E, unknown>) => {
			const entry = { fn };
			bound.set(type, [...(bound.get(type) ?? []), entry]);

			return () => {
				const rest = (bound.get(type) ?? []).filter((item) => item !== entry);
				if (rest.length > 0) {
					bound.set(type, rest);
				} else {
					bound.delete(type);
				}
			};
		};

		function handle<P, R>(
			handled: Handled<P, R>,
			fn: Task<P, E, R>,
		): UnsubscribeCallback;
		function handle<A extends { readonly type: string }>(
			action: A,
			fn: LooseHandler<A, E>,
		): UnsubscribeCallback;
		function handle(
			type: string,
			fn: Task<never, E, unknown>,
		): UnsubscribeCallback;
		function handle(
			target: string | { type: string },
			fn: Task<never, E, unknown>,
		): UnsubscribeCallback {
			return bind(eventKey(target), fn);
		}

		// the contract passes the payload and the context loosely typed: they belong to the action
		const run: Actions["run"] = (handled, payload, ctx) => {
			const stack = bound.get(handled.type) ?? [];
			const fn = stack.at(-1)?.fn;
			const routed = fn && handled.wrap ? handled.wrap(fn) : (fn ?? handled);

			return Reflect.apply(routed, null, [payload, ctx]);
		};

		// a handler bound to a type makes an action of that type an action, whatever made it
		const bound_ = (type: string): Handled | undefined =>
			bound.has(type) ? placeholder(type) : void 0;

		const registry: Registry<E> = { run, handle, bound: bound_ };
		bus.actions = registry;

		return registry;
	};
