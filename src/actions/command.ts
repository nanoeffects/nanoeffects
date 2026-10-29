import type { Bus, Command, CommandCall, Commands, Context } from "../core/bus";
import { makeCommandCall } from "../core/bus";
import { eventKey } from "../core/event";
import type { Scope, WithScope } from "../core/scope-types";
import type { EventMap, Task, UnsubscribeCallback } from "../core/types";
import type { FieldsOfScope, Scoped } from "../scope/types";
import { carry } from "./carry";

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
 * `commandsPlugin` and `bindHandler`). A handler bound there wins over the one
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
 * bus.use(commandsPlugin([bindHandler(sendMail, smtpSend)]));
 * const user = await bus.emit(getUser("1"));
 *
 * commands.handle(getUser, async () => fakeUser); // in a test
 * ```
 */
export function createCommand<
	P = void,
	R = void,
	T extends string = string,
	E extends EventMap = EventMap,
>(type: T, handler?: Task<P, E, R>): MadeCommand<P, R, T>;
export function createCommand<
	P,
	R,
	T extends string,
	S extends Scope = Record<never, never>,
>(
	type: T,
	handler: Task<P, Scoped<EventMap, S>, R> | undefined,
	scope: S,
): ScopedCommand<P, R, T, FieldsOfScope<EventMap, S>>;
export function createCommand(
	type: string,
	handler?: Task<unknown, EventMap, unknown>,
	scope?: Scope,
): MadeCommand<unknown, unknown, string> {
	const match = (action: {
		type: string;
		payload?: unknown;
	}): action is { type: string; payload: unknown } => action.type === type;

	// with a context the bus is running it; without, build the call for emit
	function invoke(payload: unknown, ctx?: Context<EventMap>) {
		if (typeof ctx === "object") {
			if (!handler) {
				throw new MissingHandlerError(`No handler for command "${type}"`);
			}
			return handler(payload, ctx);
		}
		return carry(makeCommandCall(command, type, payload), scope);
	}

	const made = Object.assign(invoke, { type, match }) as MadeCommand<
		unknown,
		unknown,
		string
	>;
	const command = carry(made, scope);

	return command;
}

/** A command (or its type) with the handler to bind to it; `bindHandler` makes one. */
export type Binding<E extends EventMap = EventMap> = readonly [
	Command<never, unknown> | string,
	Task<never, E, unknown>,
];

/**
 * Pairs a command with the handler to bind to it, for `commandsPlugin`. It
 * checks that the handler fits the command.
 *
 * @example
 * ```ts
 * bus.use(commandsPlugin([bindHandler(sendMail, smtpSend)]));
 * ```
 */
export const bindHandler = <P, R, E extends EventMap>(
	command: Command<P, R>,
	fn: Task<P, E, R>,
): Binding<E> => {
	const looseCommand: unknown = command;
	const looseTask: unknown = fn;
	return [
		looseCommand as Command<never, unknown>,
		looseTask as Task<never, E, unknown>,
	];
};

/** The registry of handlers that `commandsPlugin` returns: `run` for the bus, `handle` to bind more. */
export interface Registry<E extends EventMap> extends Commands {
	handle<P, R>(command: Command<P, R>, fn: Task<P, E, R>): UnsubscribeCallback;
	handle(type: string, fn: Task<never, E, unknown>): UnsubscribeCallback;
	handle(bindings: readonly Binding<E>[]): UnsubscribeCallback;
}

// the registry of an earlier `commandsPlugin`: `commands` with a `handle`, which a custom runner does not have
const isRegistry = <E extends EventMap>(
	commands: Commands | undefined,
): commands is Registry<E> =>
	typeof Reflect.get(commands ?? {}, "handle") === "function";

/**
 * The plugin that gives a bus the handlers bound to commands:
 * `bus.use(commandsPlugin(bindings))` makes the registry, sets it as the
 * commands of the bus and returns it. Each bus has its own, so each test can
 * have its own implementation. `handle` binds more later and returns the
 * function that unbinds. A second `commandsPlugin` on the same bus binds its
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
 * const commands = bus.use(commandsPlugin([bindHandler(sendMail, smtpSend)]));
 *
 * const unbind = commands.handle(getUser, async () => fakeUser);
 * unbind(); // the command's own handler is back
 * ```
 */
export const commandsPlugin =
	<E extends EventMap>(bindings: readonly Binding<E>[] = []) =>
	(bus: Bus<E>): Registry<E> => {
		const existing = bus.commands;
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
		const run: Commands["run"] = (command, payload, ctx) => {
			const stack = bound.get(command.type) ?? [];
			const fn = stack.at(-1)?.fn;
			const routed = fn && command.wrap ? command.wrap(fn) : (fn ?? command);

			return Reflect.apply(routed, null, [payload, ctx]);
		};

		const registry: Registry<E> = { run, handle };
		bus.commands = registry;

		return registry;
	};
