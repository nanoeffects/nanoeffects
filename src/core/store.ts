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
	// arrays handed out by `get`: an emit may still walk them, so a change copies first
	const shared = new WeakSet<unknown[]>();

	const own = (key: PropertyKey) => {
		const current = events[key] ?? [];
		if (!shared.has(current)) {
			events[key] = current;
			return current;
		}
		const copy = [...current];
		events[key] = copy;
		return copy;
	};

	const remove = (key: PropertyKey, task?: unknown) => {
		if (!task) {
			events[key] = [];
			return;
		}

		// one registration goes, as for the unsubscribe of an `on` call
		const index = (events[key] ?? []).indexOf(task);
		if (index >= 0) {
			own(key).splice(index, 1);
		}
	};

	return {
		get: (key: PropertyKey) => {
			const items = events[key] ?? [];
			shared.add(items);
			return items;
		},
		add: (key: PropertyKey, task: unknown) => {
			own(key).push(task);

			return () => {
				remove(key, task);
			};
		},
		remove,
	} as Store<E>;
};
