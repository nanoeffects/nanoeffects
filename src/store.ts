import type { Task } from "./task";
import type { EventMap, Keys, UnsubscribeCallback } from "./types";

export const anyEventType = "_any_";
type AnyType = "_any_";

export type Store<E extends EventMap> = {
	get: {
		<K extends Keys<E>>(key: K): Task<E[K], E>[];
		(key: AnyType): Task<E[Keys<E>], E>[];
	};
	add: {
		<K extends Keys<E>>(key: K, task: Task<E[K], E>): UnsubscribeCallback;
		(key: AnyType, task: Task<E[Keys<E>], E>): UnsubscribeCallback;
	};
	remove: {
		<K extends Keys<E>>(key: K, task: Task<E[K], E>): void;
		(key: AnyType, task: Task<E[Keys<E>], E>): void;
	};
	clear: () => void;
};

export const createStore = <E extends EventMap>(): Store<E> => {
	const buckets = new Map<PropertyKey, unknown[]>();

	const remove = (key: PropertyKey, task: unknown) => {
		const current = buckets.get(key) ?? [];
		buckets.set(
			key,
			current.filter((item) => item !== task),
		);
	};

	return {
		get: (key: PropertyKey) => buckets.get(key) ?? [],
		add: (key: PropertyKey, task: unknown) => {
			const items = buckets.get(key) ?? [];
			buckets.set(key, [...items, task]);

			return () => {
				remove(key, task);
			};
		},
		remove,
		clear: () => {
			buckets.clear();
		},
	} as Store<E>;
};
