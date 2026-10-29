import type { Bus } from "./core/bus";
import type { EventMap, Keys } from "./core/types";

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
) => Observable<E[K]>;

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
	return <K extends Keys<E>>(event: K): Observable<E[K]> => {
		return {
			subscribe: (observer: Observer<E[K]>) => {
				const unsubscribe = bus.on(event, listener(observer));
				return { unsubscribe };
			},
			[$$observable](): Subscribable<E[K]> {
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
	implements Observable<E[K]>
{
	readonly source: Source<E>;
	readonly event: K;

	constructor(source: Source<E>, event: K) {
		this.source = source;
		this.event = event;
		// bound here, so a `next` of a subclass is the one that is taken off
		this.next = this.next.bind(this);
	}

	subscribe(observer: Observer<E[K]>): { unsubscribe(): void } {
		const unsubscribe = this.source.on(this.event, listener(observer));
		return { unsubscribe };
	}

	next(payload: E[K]): void {
		// `emit` has many overloads; this call is the one with an event and a payload
		const emit = this.source.emit as (event: K, payload: E[K]) => void;
		Reflect.apply(emit, this.source, [this.event, payload]);
	}

	[$$observable](): Subscribable<E[K]> {
		return this;
	}
}
