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
	// a task and how many times it is registered, in the order it was first added:
	// adding and removing cost the same however many listeners there are
	const events: Record<PropertyKey, Map<unknown, number>> = {};
	// the array handed out by `get`, built on demand and never changed afterwards:
	// an emit may still walk it, so a change drops it and the next `get` builds a new one
	const lists: Record<PropertyKey, unknown[] | undefined> = {};

	const change = (key: PropertyKey) => {
		lists[key] = void 0;
		events[key] ??= new Map();

		return events[key];
	};

	const remove = (key: PropertyKey, task?: unknown) => {
		const tasks = change(key);
		const count = tasks.get(task) ?? 0;

		// one registration goes, as for the unsubscribe of an `on` call
		if (count > 1) {
			tasks.set(task, count - 1);
		} else if (task) {
			tasks.delete(task);
		} else {
			tasks.clear();
		}
	};

	return {
		get: (key: PropertyKey) => {
			lists[key] ??= [...(events[key] ?? [])].flatMap(([task, count]) =>
				Array(count).fill(task),
			);

			return lists[key];
		},
		add: (key: PropertyKey, task: unknown) => {
			const tasks = change(key);
			tasks.set(task, (tasks.get(task) ?? 0) + 1);

			return () => {
				remove(key, task);
			};
		},
		remove,
	} as Store<E>;
};
