import { anyEventType, createStore } from "./store";
import type { Task } from "./task";
import type {
	EventMap,
	Keys,
	PayloadOf,
	TraceEvent,
	UnsubscribeCallback,
} from "./types";
import { eventKey, eventPayload } from "./util";

export { anyEventType };

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
	<K extends EventKey<E>>(event: K, fn: Task<E[K], E>): UnsubscribeCallback;
	<K extends EventKey<E>, Event extends { type: K }>(
		event: Event & { type: K },
		fn: Task<E[K], E>,
	): UnsubscribeCallback;
};

export type Off<E extends EventMap> = {
	<K extends EventKey<E>>(event: K): void;
	<K extends EventKey<E>>(event: K, fn: Task<E[K], E>): void;
	<K extends EventKey<E>, Event extends { type: K }>(
		event: Event & { type: K },
		fn: Task<E[K], E>,
	): void;
};

/** Контекст задачи внутри эффекта. */
export type Context<E extends EventMap> = EventLike<E> & {
	signal: AbortSignal;
	/** emit от имени задачи; после отмены задачи не делает ничего */
	emit: Emit<E>;
	/** Дочерняя задача: отменяется вместе с родителем, ошибка уходит в родителя */
	run<P, R>(fn: Task<P, E, R>, ...args: PayloadOf<P>): Promise<Awaited<R>>;
};

export interface Bus<E extends EventMap> {
	on: On<E>;
	off: Off<E>;
	emit: Emit<E>;
}

export type BusOptions<E extends EventMap> = {
	trace?: (event: TraceEvent<E>) => void;
};

export const createBus = <Events extends EventMap>({
	trace,
}: BusOptions<Events>): Bus<Events> => {
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

	const emit = (
		event: Key | Handler<Events> | EventLike<Events>,
		payload?: EventPayload<Events>,
	) => {
		const key = eventKey(event);
		const data = eventPayload<Events>(event, payload);

		for (const fn of events.get(key)) {
			const ctx = undefined as unknown as Context<Events>;
			fn(data, ctx);
		}

		for (const fn of events.get(anyEventType)) {
			const ctx = undefined as unknown as Context<Events>;
			fn(data, ctx);
		}

		if (typeof event === "function") {
			return event(data as never);
		}
	};

	return {
		on,
		off,
		emit,
	};
};
