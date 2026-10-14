import { $$observable, type Observe, type Subscribable } from "./observable";
import { anyEventType, createStore } from "./store";
import type { Task } from "./task";
import type {
	EventMap,
	Keys,
	PayloadOf,
	TraceEvent,
	UnsubscribeCallback,
} from "./types";
import { eventKey } from "./util";

export { anyEventType };

export type EventKey<E extends EventMap> = Keys<E>;
export type EventPayload<E extends EventMap> = E[EventKey<E>];
export type WithType<K extends string> = Record<string, unknown> & { type: K };

export type HandlerRef<E extends EventMap, Response = unknown> = (
	action: Action<E>,
) => Response;

export type Handler<E extends EventMap, Response = unknown> = {
	[K in EventKey<E>]: {
		type: K;
		(payload: E[K]): Response;
	};
}[EventKey<E>];

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
	<R>(event: Handler<E, R>): R;
	(event: EventLike<E>): void;
};

export type On<E extends EventMap> = {
	<K extends EventKey<E>>(event: K, fn: Task<E[K], E>): UnsubscribeCallback;
	<K extends EventKey<E>, Event extends { type: K }>(
		event: Event & { type: K },
		fn: Task<E[K], E>,
	): UnsubscribeCallback;
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
	onAny: (fn: Task<EventPayload<E>, E>) => UnsubscribeCallback;
	emit: Emit<E>;
	observe: Observe<E>;
}

export type BusOptions<E extends EventMap> = {
	trace?: (event: TraceEvent<E>) => void;
};

export const createBus = <Events extends EventMap>({
	trace,
}: BusOptions<Events>): Bus<Events> => {
	type Key = EventKey<Events>;
	const events = createStore<Events>();
	const live = createStore<WithType<Key>>();

	const on = (
		event: Key | WithType<Key>,
		fn: Task<EventPayload<Events>, Events>,
	) => events.add(eventKey(event), fn);

	return {
		on,
		onAny: (handler) => events.add(anyEventType, handler),
		emit: (...args: unknown[]) => {
			return () => {};
		},
		observe: (event) => {
			return {
				subscribe: (observer) => {
					return { unsubscribe: () => {} };
				},
				[$$observable](): Subscribable<Events[typeof event]> {
					return this;
				},
			};
		},
	};
};
