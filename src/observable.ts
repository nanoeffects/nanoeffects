import type { EventMap, Keys } from "./types";

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
