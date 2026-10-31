import type {
	ActionCreator,
	DataOf,
	FreeActionCreator,
} from "./core/action-creator";
import type { Bus, Handled, On } from "./core/bus";
import type { EventMap, Keys } from "./core/types";
import { onAbort } from "./utils";

declare global {
	interface SymbolConstructor {
		readonly observable: symbol;
	}
}

export const $$observable: symbol = ((typeof Symbol === "function" &&
	Symbol.observable) ||
	"@@observable") as symbol;

export type Observer<T> = ((value: T) => void) | { next?: (value: T) => void };

export interface Subscribable<T> {
	subscribe(observer: Observer<T>): { unsubscribe(): void };
}

export type Observable<T> = Subscribable<T> & {
	[$$observable](): Subscribable<T>;
};

export type Observe<E extends EventMap> = <K extends Keys<E>>(
	event: K,
) => Observable<DataOf<E[K]>>;

// the handler for `bus.on`: the observer is a function or an object with `next`
const listener =
	<T>(observer: Observer<T>) =>
	(value: T): void => {
		if (typeof observer === "function") {
			observer(value);
		} else {
			observer.next?.(value);
		}
	};

export const createObserve = <E extends EventMap>(bus: Bus<E>): Observe<E> => {
	return <K extends Keys<E>>(event: K): Observable<DataOf<E[K]>> => {
		return {
			subscribe: (observer: Observer<DataOf<E[K]>>) => {
				const unsubscribe = bus.on(event, listener(observer));
				return { unsubscribe };
			},
			[$$observable](): Subscribable<DataOf<E[K]>> {
				return this;
			},
		};
	};
};

/**
 * What a `Subject` reads and writes: the `on` and `emit` of a bus. An instance
 * of a class made by `extendBus` or `Emitter` fits as well, and its `on` keeps
 * the subscription for `dispose()`.
 */
export type Source<E extends EventMap> = Pick<Bus<E>, "on" | "emit">;

/**
 * One event of a source as an Observable that can also push a payload back:
 * `subscribe` is `source.on(event, …)` and `next` is `source.emit(event, payload)`.
 * It never completes, fails or replays, and it can be extended.
 *
 * @example
 * ```ts
 * const typed = new Subject(bus, "typed"); // Subject — the event "typed" of the bus as a stream
 * const subscription = typed.subscribe((text) => console.log(text));
 * typed.next("hello"); // the same as bus.emit("typed", "hello")
 * subscription.unsubscribe();
 * ```
 */
export class Subject<E extends EventMap, K extends Keys<E>>
	implements Observable<DataOf<E[K]>>
{
	readonly source: Source<E>;
	readonly event: K;

	constructor(source: Source<E>, event: K) {
		this.source = source;
		this.event = event;
		// bound here, so a `next` of a subclass is the one that is taken off
		this.next = this.next.bind(this);
	}

	subscribe(observer: Observer<DataOf<E[K]>>): { unsubscribe(): void } {
		const unsubscribe = this.source.on(this.event, listener(observer));
		return { unsubscribe };
	}

	next(payload: DataOf<E[K]>): void {
		// `emit` has many overloads; this call is the one with an event and a payload
		const emit = this.source.emit as (event: K, payload: DataOf<E[K]>) => void;
		Reflect.apply(emit, this.source, [this.event, payload]);
	}

	[$$observable](): Subscribable<DataOf<E[K]>> {
		return this;
	}
}

/** What `events` reads: a bus, or a task context, which also ends the stream when its task aborts. */
export type EventSource<E extends EventMap> = {
	on: On<E>;
	signal?: AbortSignal | undefined;
};

/** What `events` does when the loop is slower than the emits and the buffer is full. */
export type Overflow = "drop-oldest" | "drop-newest";

export type EventsOptions = {
	/** Ends the stream: a waiting or next read rejects with the abort reason. */
	signal?: AbortSignal | undefined;
	/** The most payloads held while the loop is busy. Default: `Infinity`. */
	buffer?: number | undefined;
	/** Which payload is lost when the buffer is full. Default: `"drop-oldest"`. */
	overflow?: Overflow | undefined;
};

type Subscribe = (event: unknown, fn: (payload: unknown) => void) => () => void;

type Waiter<T> = {
	resolve: (result: IteratorResult<T>) => void;
	reject: (reason: unknown) => void;
};

/**
 * One event of a bus as an async iterator, for `for await`. It listens from the
 * call, not from the first read, so a payload between the two is not lost. The
 * loop ends with `break`, with the `signal` (the read rejects with the abort
 * reason) or, when `source` is a task context, with its task.
 *
 * While the loop is busy the payloads wait in a buffer that has no limit unless
 * `buffer` is set; when it is full `overflow` says which payload goes. An event of
 * a bus does not end, so the stream does not either.
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 *
 * // events — the "query/changed" payloads one by one; at most the last 3 are kept
 * const queries = events(bus, "query/changed", {
 *   signal: controller.signal,
 *   buffer: 3,
 * });
 * for await (const query of queries) {
 *   await search(query);
 * }
 * ```
 */
export function events<E extends EventMap, K extends Keys<E>>(
	source: EventSource<E>,
	event: K,
	options?: EventsOptions,
): AsyncIterableIterator<DataOf<E[K]>>;
export function events<E extends EventMap, K extends Keys<E>>(
	source: EventSource<E>,
	event: FreeActionCreator<K>,
	options?: EventsOptions,
): AsyncIterableIterator<DataOf<E[K]>>;
export function events<E extends EventMap, P>(
	source: EventSource<E>,
	event: ActionCreator<P> | Handled<P, unknown>,
	options?: EventsOptions,
): AsyncIterableIterator<P>;
export function events<E extends EventMap>(
	source: EventSource<E>,
	event: unknown,
	options: EventsOptions = {},
): AsyncIterableIterator<unknown> {
	const limit = options.buffer ?? Number.POSITIVE_INFINITY;
	const dropNewest = options.overflow === "drop-newest";
	let queue: unknown[] = [];
	let head = 0;
	const waiters: Array<Waiter<unknown>> = [];
	let finished = false;
	// an abort that nobody was waiting for is thrown by the next read, once
	let failure: { reason: unknown } | undefined;
	const links: Array<() => void> = [];

	const finish = (abort?: { reason: unknown }) => {
		if (finished) {
			return;
		}
		finished = true;
		for (const link of links) {
			link();
		}
		queue = [];
		head = 0;
		const first = waiters.shift();
		if (abort && first) {
			first.reject(abort.reason);
		} else if (abort) {
			failure = abort;
		}
		for (const waiter of waiters.splice(0)) {
			waiter.resolve({ done: true, value: void 0 });
		}
		first?.resolve({ done: true, value: void 0 });
	};

	const push = (payload: unknown) => {
		const waiter = waiters.shift();
		if (waiter) {
			waiter.resolve({ done: false, value: payload });
			return;
		}
		if (limit < 1) {
			return;
		}
		if (queue.length - head >= limit) {
			if (dropNewest) {
				return;
			}
			queue[head++] = void 0;
		}
		queue.push(payload);
	};

	const subscribe = source.on as Subscribe;
	links.push(subscribe(event, push));
	links.push(onAbort(source, (reason) => finish({ reason })));
	links.push(onAbort(options, (reason) => finish({ reason })));

	const next = (): Promise<IteratorResult<unknown>> => {
		if (head < queue.length) {
			const value = queue[head];
			queue[head++] = void 0;
			// a long run frees the front of the array
			if (head > 1024 && head * 2 > queue.length) {
				queue = queue.slice(head);
				head = 0;
			}

			return Promise.resolve({ done: false, value });
		}
		if (failure) {
			const { reason } = failure;
			failure = void 0;

			return Promise.reject(reason);
		}
		if (finished) {
			return Promise.resolve({ done: true, value: void 0 });
		}

		return new Promise((resolve, reject) => {
			waiters.push({ resolve, reject });
		});
	};

	const stream: AsyncIterableIterator<unknown> = {
		next,
		return: () => {
			finish();

			return Promise.resolve({ done: true, value: void 0 });
		},
		[Symbol.asyncIterator]: () => stream,
	};

	return stream;
}
