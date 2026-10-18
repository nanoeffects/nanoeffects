import { createTask, type Tracer } from "./context";
import { eventKey, eventPayload } from "./event";
import { combineLoggers } from "./logger";
import { anyEventType, createStore } from "./store";
import type {
	EventMap,
	Keys,
	PayloadOf,
	Task,
	Trace,
	UnsubscribeCallback,
} from "./types";
import { isPromise } from "./utils";

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

export type Emit<E extends EventMap> = {
	<K extends EventKey<E>>(event: K, ...payload: PayloadOf<E[K]>): void;
	<K extends EventKey<E>, R>(
		event: Handler<E, R, K>,
		...payload: PayloadOf<E[K]>
	): R;
	(event: EventLike<E>): void;
};

export type On<E extends EventMap> = {
	(event: AnyEvent, fn: Task<EventPayload<E>, E>): UnsubscribeCallback;
	<K extends EventKey<E>>(event: K, fn: Task<E[K], E>): UnsubscribeCallback;
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
};

/** Task context inside an effect. */
export type Context<E extends EventMap> = EventLike<E> & {
	signal: AbortSignal;
	/** Abort this task (and attached children). */
	abort: (reason?: unknown) => void;
	/** Emit as this task; no-op after the task is aborted. */
	emit: Emit<E>;
	/** Child task: aborted with the parent; errors propagate to the parent. */
	run<P, R>(fn: Task<P, E, R>, ...args: PayloadOf<P>): Promise<Awaited<R>>;
};

export interface Bus<E extends EventMap> {
	on: On<E>;
	off: Off<E>;
	emit: Emit<E>;
}

export type BusOptions<E extends EventMap> = {
	/** Logger(s) that receive every task phase (`start`, `done`, `error`, `cancel`, `drop`). */
	trace?: Trace<E>;
	/**
	 * Receives errors of handlers: thrown ones and rejections of async ones.
	 * Without it `emit` still runs every handler, then throws the error (several
	 * errors become an `AggregateError`); async rejections are left unhandled.
	 */
	onError?: (error: unknown, event: Action<E>) => void;
};

export const createBus = <Events extends EventMap>(
	options: BusOptions<Events> = {},
): Bus<Events> => {
	type Key = EventKey<Events>;
	let lastId = 0;
	const tracer: Tracer = {
		trace: combineLoggers(options.trace as Trace),
		nextId: () => ++lastId,
	};
	const events = createStore<Events>();

	const on = (
		event: Key | WithType<Key>,
		fn: Task<EventPayload<Events>, Events>,
	) => events.add(eventKey(event), fn);

	const off = (
		event: Key | WithType<Key>,
		fn?: Task<EventPayload<Events>, Events>,
	) => events.remove(eventKey(event), fn);

	const emit = (
		event: Key | Handler<Events> | EventLike<Events>,
		payload?: EventPayload<Events>,
	) => {
		const key = eventKey(event);
		const data = eventPayload<Events>(event, payload);

		const action = { type: key, payload: data };
		const errors: unknown[] = [];
		const { onError } = options;
		const fail = (error: unknown) => {
			if (onError) {
				onError(error, action);
			} else {
				errors.push(error);
			}
		};

		for (const fn of [...events.get(key), ...events.get(anyEventType)]) {
			const { ctx } = createTask(action, emit, tracer);
			try {
				const result = fn(data, ctx);
				if (onError && isPromise(result)) {
					Promise.resolve(result).catch(fail);
				}
			} catch (error) {
				fail(error);
			}
		}

		if (errors.length === 1) {
			throw errors[0];
		}
		if (errors.length > 1) {
			throw new AggregateError(errors, "Several handlers failed");
		}

		if (typeof event === "function") {
			return event(data);
		}
	};

	return {
		on,
		off,
		emit,
	};
};
