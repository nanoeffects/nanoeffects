import type { ActionCreator } from "../actions/action";
import { isPromise, report } from "../utils";
import { createTask, currentEmitter, traceRun } from "./context";
import { eventKey, eventPayload } from "./event";
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

export type WithPayload<
	E extends EventMap,
	K extends EventKey<E>,
> = undefined extends E[K]
	? { type: K; payload?: E[K] }
	: { type: K; payload: E[K] };

export type EventLike<E extends EventMap> = {
	[K in EventKey<E>]: WithPayload<E, K>;
}[Keys<E>];

/**
 * A typed request for a result. `bus.emit(command, payload)` runs the handler
 * of the command as a task and returns what it returns. Made by
 * `createCommand` in `nanoeffects/actions`.
 */
export type Command<P = never, R = unknown> = {
	(payload: P, ctx?: never): R;
	readonly type: string;
	/** Wraps the handler that really runs, e.g. to route its outcome. */
	readonly wrap?: (
		run: (payload: never, ctx: never) => unknown,
	) => (payload: never, ctx: never) => unknown;
};

/**
 * What the bus needs to run commands. The implementation, `createCommands` in
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
	| EventLike<E>;

export type Emit<E extends EventMap> = {
	<K extends EventKey<E>>(event: K, ...payload: PayloadOf<E[K]>): void;
	<K extends EventKey<E>, R>(
		event: Handler<E, R, K>,
		...payload: PayloadOf<E[K]>
	): R;
	<P, R>(command: Command<P, R>, ...payload: PayloadOf<P>): R;
	(event: EventLike<E>): void;
};

export type On<E extends EventMap> = {
	(event: AnyEvent, fn: Task<EventPayload<E>, E>): UnsubscribeCallback;
	<K extends EventKey<E>>(event: K, fn: Task<E[K], E>): UnsubscribeCallback;
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

declare global {
	/**
	 * Your own fields of every task context: declare them here and give their
	 * values in `createBus({ context })`.
	 *
	 * @example
	 * ```ts
	 * declare global {
	 *   interface NanoeffectsContext {
	 *     store: Store;
	 *   }
	 * }
	 *
	 * const bus = createBus<Events>({ context: { store } });
	 * bus.on("save", (draft, { store }) => store.put(draft));
	 * ```
	 */
	interface NanoeffectsContext {}
}

/** Task context inside an effect. */
export type Context<E extends EventMap> = EventLike<E> &
	NanoeffectsContext & {
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

export interface Bus<E extends EventMap> {
	on: On<E>;
	off: Off<E>;
	emit: Emit<E>;
	/** `BusOptions.context`, `.trace` and `.commands`, for what makes tasks of its own, like `registerModules`. */
	readonly context?: NanoeffectsContext | undefined;
	readonly commands?: Commands | undefined;
	readonly trace?: Tracer | undefined;
}

export type BusOptions<E extends EventMap> = {
	/**
	 * Runs commands: make it with `createCommands` from `nanoeffects/actions`.
	 * Without it an event that is a function runs as it is, with the payload and
	 * the task context.
	 */
	commands?: Commands;
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
	 * Fields added to the context of every task of this bus, its child tasks
	 * and the tasks of effects included: a store, a logger, a client. Their
	 * types come from `NanoeffectsContext`. The fields of the library win over
	 * these when the names are the same.
	 */
	context?: NanoeffectsContext;
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

	const off = (
		event: Key | WithType<Key>,
		fn?: Task<EventPayload<Events>, Events>,
	) => events.remove(eventKey(event), fn);

	const emit = (event: Emittable<Events>, payload?: EventPayload<Events>) => {
		const key = eventKey(event);
		const data = eventPayload<Events>(event, payload);

		const action = { type: key, payload: data };
		const { onError } = options;
		const fail = (error: unknown) => {
			try {
				onError?.(error, action);
			} catch (failure) {
				report("onError failed", failure);
			}
		};

		for (const fn of [...events.get(key), ...events.get(anyEventType)]) {
			const { ctx } = createTask(action, bus, options.trace, {
				ref: currentEmitter(),
			});

			if (!onError) {
				fn(data, ctx);
				continue;
			}

			try {
				const result = fn(data, ctx);
				if (isPromise(result)) {
					Promise.resolve(result).catch(fail);
				}
			} catch (error) {
				fail(error);
			}
		}

		if (typeof event === "function") {
			const { ctx } = createTask(action, bus, options.trace, {
				ref: currentEmitter(),
			});
			const run = options.commands?.run ?? callCommand;

			return traceRun(ctx, "command", () => run(event, data, ctx));
		}
	};

	const bus: Bus<Events> = {
		on,
		off,
		emit,
		commands: options.commands,
		context: options.context,
		trace: options.trace,
	};

	return bus;
};
