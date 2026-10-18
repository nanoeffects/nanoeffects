import type { EventMap, Keys, Task, UnsubscribeCallback } from "./types";

export const anyEventType = "*";
type AnyType = "*";

export interface UnsubscribeTask<E extends EventMap> {
	(task: Task<E[Keys<E>], E>): void;
	<K extends AnyType>(key: K, task?: Task<E[Keys<E>], E>): void;
	<K extends Keys<E>>(key: K, task?: Task<E[K], E>): void;
}

export type Store<E extends EventMap> = {
	get: {
		(key: AnyType): Task<E[Keys<E>], E>[];
		<K extends Keys<E>>(key: K): Task<E[K], E>[];
	};
	add: {
		(key: AnyType, task: Task<E[Keys<E>], E>): UnsubscribeCallback;
		<K extends Keys<E>>(key: K, task: Task<E[K], E>): UnsubscribeCallback;
	};
	remove: UnsubscribeTask<E>;
};

export const createStore = <E extends EventMap>(): Store<E> => {
	const events: Record<PropertyKey, unknown[]> = {};

	const remove = (key: PropertyKey, task?: unknown) => {
		const current = events[key] ?? [];
		if (task) {
			events[key] = current.filter((item) => item !== task);
		} else {
			events[key] = [];
		}
	};

	return {
		get: (key: PropertyKey) => events[key] ?? [],
		add: (key: PropertyKey, task: unknown) => {
			const items = events[key] ?? [];
			events[key] = [...items, task];

			return () => {
				remove(key, task);
			};
		},
		remove,
	} as Store<E>;
};
