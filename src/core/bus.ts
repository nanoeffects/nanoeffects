import { isPromise, report } from "../utils";
import type {
	ActionCreator,
	FreeActionCreator,
	WithPayload,
} from "./action-creator";
import { createTask, currentEmitter, traceRun } from "./context";
import { eventKey, eventPayload } from "./event";
import type { EmitScope, WithFields, WithScope } from "./scope-types";
import { anyEventType, createStore } from "./store";
import type { Tracer } from "./tracer";
import type {
	EventMap,
	Keys,
	PayloadOf,
	Task,
	UnsubscribeCallback,
} from "./types";

export { anyEventType };

/** Subscribes to every event; handlers receive the payload of any of them. */
export type AnyEvent = typeof anyEventType;

export type EventKey<E extends EventMap> = Keys<E>;
export type EventPayload<E extends EventMap> = E[EventKey<E>];
export type WithType<K extends string> = { type: K };

export type HandlerRef<E extends EventMap, Response = unknown> = (
	action: Action<E>,
) => Response;

export type Handler<
	E extends EventMap,
	Response = unknown,
	K extends EventKey<E> = EventKey<E>,
> = {
	[P in K]: {
		type: P;
		(payload: E[P]): Response;
	};
}[K];

export type Action<E extends EventMap> = {
	type: EventKey<E>;
	payload: EventPayload<E>;
};

export type { WithPayload };

export type EventLike<E extends EventMap> = {
	[K in EventKey<E>]: WithPayload<E, K>;
}[Keys<E>];

/**
 * Brands `{ type, payload }` from a command call so `emit` can run the command.
 * Not enumerable on the object.
 */
export const commandCall = Symbol("nanoeffects.commandCall");

/**
 * What `command(payload)` returns: an action-shaped value that `emit` runs as
 * that command. A plain `{ type, payload }` without this brand is notify-only.
 */
export type CommandCall<P = unknown, R = unknown> = {
	type: string;
	payload: P;
	readonly [commandCall]: Command<P, R>;
};

/**
 * A typed request for a result. Calling it builds `{ type, payload }` like
 * `createAction`; `bus.emit(command(payload))` (or `bus.emit(command, payload)`)
 * runs the handler as a task and returns what it returns. Made by
 * `createCommand` in `nanoeffects/actions`.
 */
export type Command<P = never, R = unknown> = {
	(payload: P): CommandCall<P, R>;
	readonly type: string;
	/** Wraps the handler that really runs, e.g. to route its outcome. */
	readonly wrap?: (
		run: (payload: never, ctx: never) => unknown,
	) => (payload: never, ctx: never) => unknown;
};

/** Builds a branded command call for `emit`. */
export const makeCommandCall = <P, R>(
	command: Command<P, R>,
	type: string,
	payload: P,
): CommandCall<P, R> => {
	const action = { type, payload } as CommandCall<P, R>;
	Object.defineProperty(action, commandCall, {
		value: command,
		enumerable: false,
	});
	return action;
};

/** The command to run for an emit argument, if any. */
export const commandOf = (
	event: unknown,
): Command<never, unknown> | undefined => {
	if (typeof event === "function") {
		const loose: unknown = event;
		return loose as Command<never, unknown>;
	}
	if (typeof event === "object" && event !== null && commandCall in event) {
		const call = event as CommandCall<unknown, unknown>;
		const loose: unknown = call[commandCall];
		return loose as Command<never, unknown>;
	}
};

/**
 * What the bus needs to run commands. The implementation, `commandsPlugin` in
 * `nanoeffects/actions`, holds the handlers bound to commands and runs the
 * right one, so a bus without `commands` carries none of that.
 */
export interface Commands {
	run(command: Command, payload: unknown, ctx: unknown): unknown;
}

// runs a command as it is, when the bus has no `commands` to run it
const callCommand: Commands["run"] = (command, payload, ctx) =>
	Reflect.apply(command, null, [payload, ctx]);

/** Anything `emit` takes as its first argument: an event type, an action or a command. */
export type Emittable<E extends EventMap> =
	| EventKey<E>
	| Command
	| CommandCall
	| EventLike<E>;

export type Emit<E extends EventMap> = {
	<K extends EventKey<E>>(event: K, ...payload: PayloadOf<E[K]>): void;
	/** Before Handler: a command is callable too, and must return its result type. */
	<P, R>(command: Command<P, R>, ...payload: PayloadOf<P>): R;
	/** A scope as the second argument replaces context fields for the tasks of this emit; see `scopePlugin`. */
	<P, R, F>(call: CommandCall<P, R> & WithScope<F>, scope?: EmitScope<E, F>): R;
	<P, R>(call: CommandCall<P, R>, scope?: EmitScope<E>): R;
	<K extends EventKey<E>, R>(
		event: Handler<E, R, K>,
		...payload: PayloadOf<E[K]>
	): R;
	<F>(event: EventLike<E> & WithScope<F>, scope?: EmitScope<E, F>): void;
	(event: EventLike<E>, scope?: EmitScope<E>): void;
};

export type On<E extends EventMap> = {
	(event: AnyEvent, fn: Task<EventPayload<E>, E>): UnsubscribeCallback;
	<K extends EventKey<E>>(event: K, fn: Task<E[K], E>): UnsubscribeCallback;
	/** An action creator without a payload type: the payload comes from the event map. */
	/** The creators and commands that carry a scope come first: the handler sees their fields. */
	<K extends EventKey<E>, F>(
		creator: FreeActionCreator<K, F> & WithScope<F>,
		fn: Task<E[K], WithFields<E, F>>,
	): UnsubscribeCallback;
	<P, F>(
		creator: ActionCreator<P, string, PayloadOf<P>, F> & WithScope<F>,
		fn: Task<P, WithFields<E, F>>,
	): UnsubscribeCallback;
	<P, F>(
		command: Command<P, unknown> & WithScope<F>,
		fn: Task<P, WithFields<E, F>>,
	): UnsubscribeCallback;
	<K extends EventKey<E>>(
		creator: FreeActionCreator<K>,
		fn: Task<E[K], E>,
	): UnsubscribeCallback;
	/** An action creator: the payload comes from it, so an event map is not needed. */
	<P>(creator: ActionCreator<P>, fn: Task<P, E>): UnsubscribeCallback;
	/** A command: the payload comes from it too. */
	<P>(command: Command<P, unknown>, fn: Task<P, E>): UnsubscribeCallback;
	<K extends EventKey<E>, Event extends { type: K }>(
		event: Event & { type: K },
		fn: Task<E[K], E>,
	): UnsubscribeCallback;
};

export type Off<E extends EventMap> = {
	/** Removes every listener of every event (including `"*"`). */
	(): void;
	(event: AnyEvent): void;
	(event: AnyEvent, fn: Task<EventPayload<E>, E>): void;
	<K extends EventKey<E>>(event: K): void;
	<K extends EventKey<E>>(event: K, fn: Task<E[K], E>): void;
	<K extends EventKey<E>, Event extends { type: K }>(
		event: Event & { type: K },
		fn: Task<E[K], E>,
	): void;
	<P>(command: Command<P, unknown>, fn?: Task<P, E>): void;
};

// only the type of this key is used: it never exists at run time
declare const contextKey: unique symbol;

/**
 * Your own fields of every task context, in the event map: add it to the
 * events with `&` and give the values in `createBus({ context })`. The fields
 * are in the context of every task of that bus, and the compiler checks them.
 *
 * @example
 * ```ts
 * type Events = { save: Draft } & WithContext<{ store: Store }>;
 *
 * const bus = createBus<Events>({ context: { store } });
 * bus.on("save", (draft, { store }) => store.put(draft));
 * ```
 */
export type WithContext<Fields extends object> = {
	readonly [contextKey]?: Fields;
};

/** The fields that the event map `E` adds to the context of a task. */
export type ContextOf<E extends EventMap> = typeof contextKey extends keyof E
	? NonNullable<E[typeof contextKey]>
	: unknown;

/** Fields for the context of every task, or a function that makes them for one task. */
export type ContextOption<E extends EventMap> =
	| ContextOf<E>
	| ((event: { type: string; payload?: unknown }) => ContextOf<E>);

/** Task context inside an effect. */
export type Context<E extends EventMap> = EventLike<E> &
	ContextOf<E> & {
		signal: AbortSignal;
		/** Abort this task (and attached children). */
		abort: (reason?: unknown) => void;
		/** Emit as this task; no-op after the task is aborted. */
		emit: Emit<E>;
		/**
		 * Subscribe as this task. The subscription is removed when the task aborts;
		 * after that this is a no-op that returns a no-op.
		 */
		on: On<E>;
		/** Same as the bus `off`. */
		off: Off<E>;
		/** Child task: aborted with the parent; errors propagate to the parent. */
		run<P, R>(fn: Task<P, E, R>, ...args: PayloadOf<P>): Promise<Awaited<R>>;
	};

/**
 * The event map of a bus, with the context fields that plugins added. Use it to
 * name the types of a bus in other files: `type AppEvents = EventsOf<typeof bus>`.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>().use(effectsPlugin({ race }));
 * type AppEvents = EventsOf<typeof bus>;
 * type AppContext = Context<AppEvents>; // has `race`
 * ```
 */
export type EventsOf<B> = B extends Bus<infer E extends EventMap> ? E : never;

export interface Bus<E extends EventMap> {
	on: On<E>;
	/**
	 * Like `on`, but the handler runs at most once: it is removed before it is
	 * invoked, so a nested emit of the same event does not re-enter it.
	 */
	once: On<E>;
	off: Off<E>;
	emit: Emit<E>;
	/**
	 * Calls `plugin` with the bus and returns what it returns: an api, a
	 * function that undoes it. A plugin is any function of the bus; the bus keeps
	 * no list of them. See `modulePlugin` in `nanoeffects/actions`.
	 */
	use<R>(plugin: (bus: Bus<E>) => R): R;
	/** `BusOptions.context` and `.trace`, and `commands`, for what makes tasks of its own, like `modulePlugin`. */
	readonly ctx?: ContextOption<E> | undefined;
	/** What runs the commands; `commandsPlugin` and `modulePlugin` set it. Without one a command runs its own handler. */
	commands?: Commands | undefined;
	readonly trace?: Tracer | undefined;
	/** Called with every new task context to add fields to it, for what needs the task, like `effectsPlugin`. Chain to the previous one. */
	addContext?: ((ctx: object) => void) | undefined;
}

export type BusOptions<E extends EventMap> = {
	/** Tracing of every task phase; make it with `createTracer` from `nanoeffects/trace`. */
	trace?: Tracer;
	/**
	 * Receives errors of handlers: thrown ones and rejections of async ones.
	 * Without it handlers run like in a plain loop: the first error stops the
	 * rest and is thrown to the caller of `emit`, and rejections of async
	 * handlers are left unhandled. With it every handler runs and errors go
	 * here; an `onError` that throws is logged to `console.error`.
	 */
	onError?: (error: unknown, event: Action<E>) => void;
	/**
	 * Called when an event is emitted and nobody listens to it: the usual sign
	 * of a typo in an event name. Not called for commands, which always have a
	 * handler to run. Typically a warning in development only.
	 *
	 * @example
	 * ```ts
	 * createBus<Events>({
	 *   onUnhandled: import.meta.env.DEV ? ({ type }) => console.warn(`Nobody listens to "${type}"`) : void 0,
	 * });
	 * ```
	 */
	onUnhandled?: (event: Action<E>) => void;
	/**
	 * Fields added to the context of every task of this bus, its child tasks
	 * and the tasks of effects included: a store, a logger, a client. Their
	 * types come from `WithContext` in the event map. The fields of the library
	 * win over these when the names are the same. A function gets
	 * `{ type, payload }` of the task and returns its fields, for fields that
	 * depend on the task.
	 */
	context?: ContextOption<E>;
};

export const createBus = <Events extends EventMap>(
	options: BusOptions<Events> = {},
): Bus<Events> => {
	type Key = EventKey<Events>;
	const events = createStore<Events>();

	const on = (
		event: Key | WithType<Key>,
		fn: Task<EventPayload<Events>, Events>,
	) => events.add(eventKey(event), fn);

	const once = (
		event: Key | WithType<Key>,
		fn: Task<EventPayload<Events>, Events>,
	) => {
		const unbind = on(event, (payload, ctx) => {
			unbind();
			return fn(payload, ctx);
		});
		return unbind;
	};

	const off = (
		event?: Key | WithType<Key>,
		fn?: Task<EventPayload<Events>, Events>,
	) => {
		if (event === void 0) {
			events.clear();
			return;
		}
		events.remove(eventKey(event), fn);
	};

	// runs one handler as a task; errors go to `onError` when there is one
	const callHandler = (
		fn: Task<EventPayload<Events>, Events>,
		action: Action<Events>,
	) => {
		const { onError } = options;
		const { ctx } = createTask({
			event: action,
			bus,
			tracer: options.trace,
			parent: { ref: currentEmitter() },
		});
		if (!onError) {
			fn(action.payload, ctx);
			return;
		}

		const fail = (error: unknown) => {
			try {
				onError(error, action);
			} catch (failure) {
				report("onError failed", failure);
			}
		};
		try {
			const result = fn(action.payload, ctx);
			if (isPromise(result)) {
				Promise.resolve(result).catch(fail);
			}
		} catch (error) {
			fail(error);
		}
	};

	const emit = (event: Emittable<Events>, payload?: EventPayload<Events>) => {
		const key = eventKey(event);
		const data = eventPayload<Events>(event, payload);
		const action = { type: key, payload: data };
		const command = commandOf(event);

		const handlers = [...events.get(key), ...events.get(anyEventType)];
		// a command always has a handler to run, so only events can go unheard
		if (handlers.length === 0 && !command) {
			options.onUnhandled?.(action);
		}
		for (const fn of handlers) {
			callHandler(fn, action);
		}

		if (command) {
			const { ctx } = createTask({
				event: action,
				bus,
				tracer: options.trace,
				parent: { ref: currentEmitter() },
			});
			const run = bus.commands?.run ?? callCommand;

			return traceRun(ctx, "command", () => run(command, data, ctx));
		}
	};

	const bus: Bus<Events> = {
		on,
		once: once as On<Events>,
		off: off as Off<Events>,
		emit: emit as Emit<Events>,
		use: (plugin) => plugin(bus),
		ctx: options.context,
		trace: options.trace,
	};

	return bus;
};
