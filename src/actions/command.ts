import type { Bus, Command, Commands, Context } from "../core/bus";
import { createTask } from "../core/context";
import { eventKey } from "../core/event";
import type { EventMap, Task, UnsubscribeCallback } from "../core/types";

/** Thrown when a command runs without a handler: a mistake of the program, not a failure of the work. */
export class MissingHandlerError extends Error {}

/**
 * Creates a command: a typed request for a result. `bus.emit(command, payload)`
 * runs its handler as a task, with a context, and returns what the handler
 * returns. Listeners of the command's type are told first, as for any event.
 *
 * The handler is optional. A command without one is only a contract, and the
 * bus gets its implementation from the `commands` registry (see
 * `createCommands` and `bindHandler`). A handler bound there wins over the one
 * the command was created with, so a test can give a bus its own implementation.
 *
 * A handler can be wrapped in a policy, e.g. `latest(fn)`. Calling the command
 * directly, `command(payload)`, runs its own handler outside of any bus.
 *
 * @example
 * ```ts
 * const getUser = createCommand("user/get", (id: string, { signal }) =>
 *   fetchUser(id, { signal }),
 * );
 * const sendMail = createCommand<Mail, void>("mail/send"); // implemented elsewhere
 *
 * const commands = createCommands([bindHandler(sendMail, smtpSend)]);
 * const bus = createBus({ commands });
 * const user = await bus.emit(getUser, "1");
 *
 * commands.handle(getUser, async () => fakeUser); // in a test
 * ```
 */
export const createCommand = <
	P = void,
	R = void,
	T extends string = string,
	E extends EventMap = EventMap,
>(
	type: T,
	handler?: Task<P, E, R>,
): Command<P, R> & { readonly type: T } => {
	const run = (payload: P, ctx?: Context<E>): R => {
		if (!handler) {
			throw new MissingHandlerError(`No handler for command "${type}"`);
		}

		return handler(
			payload,
			ctx ?? createTask<E>({ event: { type, payload } }).ctx,
		);
	};

	return Object.assign(run, { type });
};

/** A command (or its type) with the handler to bind to it; `bindHandler` makes one. */
export type Binding<E extends EventMap = EventMap> = readonly [
	Command<never, unknown> | string,
	Task<never, E, unknown>,
];

/**
 * Pairs a command with the handler to bind to it, for `createCommands`. It
 * checks that the handler fits the command.
 *
 * @example
 * ```ts
 * createCommands([bindHandler(sendMail, smtpSend)]);
 * ```
 */
export const bindHandler = <P, R, E extends EventMap>(
	command: Command<P, R>,
	fn: Task<P, E, R>,
): Binding<E> => [command, fn];

/**
 * The handlers bound to commands of `bus`: it makes the registry, sets it as
 * the commands of the bus and returns it. Each bus has its own, so each test
 * can have its own implementation. `handle` binds more later and returns the
 * function that unbinds. A second `createCommands(bus)` replaces the registry
 * of that bus.
 *
 * What the bus runs for a command: the handler bound last, else the one the
 * command was created with, else it throws `No handler for command "..."`.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>();
 * const commands = createCommands(bus, [bindHandler(sendMail, smtpSend)]);
 *
 * const unbind = commands.handle(getUser, async () => fakeUser);
 * unbind(); // the command's own handler is back
 * ```
 */
export const createCommands = <E extends EventMap>(
	bus: Bus<E>,
	bindings: readonly Binding<E>[] = [],
) => {
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

	const registry = { run, handle };
	bus.commands = registry;

	return registry;
};
