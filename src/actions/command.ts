import type { Actions, Bus, Command, CommandCall, Context } from "../core/bus";
import { commandCall, makeCommandCall } from "../core/bus";
import { eventKey } from "../core/event";
import type { Scope, WithScope } from "../core/scope-types";
import type { EventMap, Task, UnsubscribeCallback } from "../core/types";
import type { FieldsOfScope, Scoped } from "../scope/types";
import { carry } from "./carry";

// what `bound` hands to the bus for a type: the handler is found again by `type` when it runs
const placeholder = (type: string): Command => {
	const build = (payload: never) => makeCommandCall(command, type, payload);
	const command: Command = Object.assign(build, { type });

	return command;
};

/** Builds the payload of a call from the arguments of the creator, as `createAction` takes it in `prepare`. */
export type Prepare = (...args: never[]) => { payload: unknown };

// the context of a task has the signal and the `emit` of the bus: arguments of a creator do not
const isTaskContext = (value: unknown): value is Context<EventMap> =>
	typeof value === "object" &&
	value !== null &&
	Reflect.get(value, "signal") instanceof AbortSignal &&
	typeof Reflect.get(value, "emit") === "function";

/** Thrown when a command runs without a handler: a mistake of the program, not a failure of the work. */
export class MissingHandlerError extends Error {}

/** What `createCommand` returns: a command that also tells whether an action is of its type. */
export type MadeCommand<P, R, T extends string> = Command<P, R> & {
	readonly type: T;
	/** Tells whether an action has the type of this command, and narrows its type. */
	match(action: { type: string; payload?: unknown }): action is {
		type: T;
		payload: P;
	};
};

/** `Made`, called so that its calls carry the scope fields `F`; `Made` itself when there are none. */
export type CarryingCalls<Made, P, R, F> = [unknown] extends [F]
	? Made
	: ((payload: P) => CommandCall<P, R> & WithScope<F>) & Made & WithScope<F>;

/** A command made with a scope: its calls carry the fields of that scope, for the checker. */
export type ScopedCommand<P, R, T extends string, F> = ((
	payload: P,
) => CommandCall<P, R> & WithScope<F>) &
	MadeCommand<P, R, T> &
	WithScope<F>;

/**
 * Creates a command: a typed request for a result. Calling it builds
 * `{ type, payload }` like `createAction`. `bus.emit(command(payload))` (or
 * `bus.emit(command, payload)`) runs its handler as a task, with a context, and
 * returns what the handler returns. Listeners of the command's type are told
 * first, as for any event.
 *
 * The handler is optional. A command without one is only a contract, and the
 * bus gets its implementation from the `commands` registry (see
 * `actionsPlugin` and `setHandler`). A handler bound there wins over the one
 * the command was created with, so a test can give a bus its own implementation.
 *
 * A handler can be wrapped in a policy, e.g. `latest(fn)`.
 * `command.match(action)` tells whether an action has the type of the command,
 * as it does for an action creator.
 *
 * A scope as the third argument, `{ cache, $effects: { race } }`, puts those fields on
 * the context of the handler and of the listeners of the command; the handler
 * sees them typed. It works on a bus that uses `scopePlugin` from
 * `nanoeffects/scope` and is ignored on any other.
 *
 * @example
 * ```ts
 * const getUser = createCommand("user/get", (id: string, { signal }) =>
 *   fetchUser(id, { signal }),
 * );
 * const sendMail = createCommand<Mail, void>("mail/send"); // implemented elsewhere
 *
 * const bus = createBus<Events>();
 * bus.use(actionsPlugin([setHandler(sendMail, smtpSend)]));
 * const user = await bus.emit(getUser("1"));
 *
 * commands.handle(getUser, async () => fakeUser); // in a test
 * ```
 */
export function makeCommand<
	P = void,
	R = void,
	T extends string = string,
	E extends EventMap = EventMap,
>(type: T, handler?: Task<P, E, R>): MadeCommand<P, R, T>;
export function makeCommand<
	P,
	R,
	T extends string,
	S extends Scope = Record<never, never>,
>(
	type: T,
	handler: Task<P, Scoped<EventMap, S>, R> | undefined,
	scope: S,
): ScopedCommand<P, R, T, FieldsOfScope<EventMap, S>>;
export function makeCommand(
	type: string,
	handler?: Task<unknown, EventMap, unknown>,
	scope?: Scope,
): MadeCommand<unknown, unknown, string> {
	return buildCommand(type, handler, scope);
}

/** `makeCommand` with the loose types of the runtime, and `prepare`, which `createAction` also gives. */
export function buildCommand(
	type: string,
	handler?: Task<unknown, EventMap, unknown>,
	scope?: Scope,
	prepare?: Prepare,
): MadeCommand<unknown, unknown, string> {
	const match = (action: {
		type: string;
		payload?: unknown;
	}): action is { type: string; payload: unknown } => action.type === type;

	// The bus runs a command as `command(payload, ctx)`, and a user builds a call as
	// `command(...args)`. Without `prepare` a second object argument can only be the
	// context; with it the arguments are the user's own, so the context is known by what it has.
	const runs = (args: unknown[]) =>
		prepare
			? args.length === 2 && isTaskContext(args[1])
			: typeof args[1] === "object";

	function invoke(...args: unknown[]) {
		const [first, second] = args;
		if (runs(args)) {
			if (!handler) {
				throw new MissingHandlerError(`No handler for command "${type}"`);
			}
			const ctx = second as Context<EventMap>;

			return handler(first, ctx);
		}
		const built: { payload: unknown } | undefined =
			prepare && Reflect.apply(prepare, null, args);
		const payload = built ? built.payload : first;

		return carry(makeCommandCall(command, type, payload), scope);
	}

	const made = Object.assign(invoke, {
		type,
		match,
		toString: () => type,
	}) as MadeCommand<unknown, unknown, string>;
	const command = carry(made, scope);

	return command;
}

/** A command (or its type) with the handler to bind to it; `setHandler` makes one. */
export type Binding<E extends EventMap = EventMap> = readonly [
	Command<never, unknown> | string,
	Task<never, E, unknown>,
];

/**
 * Pairs an action with the handler to bind to it, for `actionsPlugin`. For a
 * command (an action made with a handler, or with a `Call` type) it checks that
 * the handler fits; any other action is accepted with a handler of any payload.
 *
 * @example
 * ```ts
 * bus.use(actionsPlugin([setHandler(sendMail, smtpSend)]));
 * ```
 */
export function setHandler<P, R, E extends EventMap>(
	command: Command<P, R>,
	fn: Task<P, E, R>,
): Binding<E>;
export function setHandler<
	A extends { readonly type: string },
	E extends EventMap,
>(action: A, fn: LooseHandler<A, E>): Binding<E>;
export function setHandler(
	action: { readonly type: string },
	fn: Task<never, EventMap, unknown>,
): Binding<EventMap> {
	// a binding is looked up by the type of the action, so a command is only a way to say it
	const looseAction: unknown = action;

	return [looseAction as Command<never, unknown>, fn];
}

/**
 * The handler an action that is not a command can have: any. A command
 * (a creator whose calls are command calls) is not accepted here, so its own
 * overload checks the handler against its payload and result.
 */
export type LooseHandler<A, E extends EventMap> = A extends (
	...args: never[]
) => { readonly [commandCall]: unknown }
	? never
	: Task<never, E, unknown>;

/** The registry of handlers that `actionsPlugin` returns: `run` for the bus, `handle` to bind more. */
export interface Registry<E extends EventMap> extends Actions {
	handle<P, R>(command: Command<P, R>, fn: Task<P, E, R>): UnsubscribeCallback;
	/** Also an action made without a handler: what is emitted for its type runs `fn` and returns its result. */
	handle<A extends { readonly type: string }>(
		action: A,
		fn: LooseHandler<A, E>,
	): UnsubscribeCallback;
	handle(type: string, fn: Task<never, E, unknown>): UnsubscribeCallback;
	handle(bindings: readonly Binding<E>[]): UnsubscribeCallback;
}

// the registry of an earlier `actionsPlugin`: `actions` with a `handle`, which a custom runner does not have
const isRegistry = <E extends EventMap>(
	actions: Actions | undefined,
): actions is Registry<E> =>
	typeof Reflect.get(actions ?? {}, "handle") === "function";

/**
 * The plugin that gives a bus the handlers bound to commands:
 * `bus.use(actionsPlugin(bindings))` makes the registry, sets it as the
 * commands of the bus and returns it. Each bus has its own, so each test can
 * have its own implementation. `handle` binds more later and returns the
 * function that unbinds. A second `actionsPlugin` on the same bus binds its
 * list in the registry that is there and returns it, so the order of the
 * plugins does not matter. A `commands` that is not such a registry (a custom
 * runner) is replaced.
 *
 * What the bus runs for a command: the handler bound last, else the one the
 * command was created with, else it throws `No handler for command "..."`.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>();
 * const commands = bus.use(actionsPlugin([setHandler(sendMail, smtpSend)]));
 *
 * const unbind = commands.handle(getUser, async () => fakeUser);
 * unbind(); // the command's own handler is back
 * ```
 */
export const actionsPlugin =
	<E extends EventMap>(bindings: readonly Binding<E>[] = []) =>
	(bus: Bus<E>): Registry<E> => {
		const existing = bus.actions;
		if (isRegistry<E>(existing)) {
			existing.handle(bindings);

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
			command: Command<P, R>,
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
		function handle(bindings: readonly Binding<E>[]): UnsubscribeCallback;
		function handle(
			target: string | { type: string } | readonly Binding<E>[],
			fn?: Task<never, E, unknown>,
		): UnsubscribeCallback {
			if (fn) {
				const command = target as string | { type: string };
				return bind(eventKey(command), fn);
			}

			const list = target as readonly Binding<E>[];
			const unbinds = list.map(([command, handler]) =>
				bind(eventKey(command), handler),
			);

			return () => {
				for (const unbind of unbinds) {
					unbind();
				}
			};
		}

		handle(bindings);

		// the contract passes the payload and the context loosely typed: they belong to the command
		const run: Actions["run"] = (command, payload, ctx) => {
			const stack = bound.get(command.type) ?? [];
			const fn = stack.at(-1)?.fn;
			const routed = fn && command.wrap ? command.wrap(fn) : (fn ?? command);

			return Reflect.apply(routed, null, [payload, ctx]);
		};

		// a handler bound to a type makes an action of that type a command, whatever made it
		const bound_ = (type: string): Command | undefined =>
			bound.has(type) ? placeholder(type) : void 0;

		const registry: Registry<E> = { run, handle, bound: bound_ };
		bus.actions = registry;

		return registry;
	};
