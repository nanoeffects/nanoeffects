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

export const createObserve = <E extends EventMap>(bus: Bus<E>): Observe<E> => {
	return <K extends Keys<E>>(event: K): Observable<E[K]> => {
		return {
			subscribe: (observer: Observer<E[K]>) => {
				const unsubscribe = bus.on(event, (payload) => {
					if (typeof observer === "function") {
						observer(payload);
					} else {
						observer.next?.(payload);
					}
				});
				return { unsubscribe };
			},
			[$$observable](): Subscribable<E[K]> {
				return this;
			},
		};
	};
};
