import type { EventMap, Task } from "../core/types";

/** Options shared by every policy that can keep its state per key. */
export type KeyOption<P> = {
	/**
	 * Gives each key its own state: calls with different keys do not affect
	 * each other. The state of a key is dropped when that key goes idle, so
	 * keys can be unbounded (ids, urls).
	 */
	key?: (payload: P) => unknown;
};

export const noop = () => {};

/**
 * Builds one policy instance per key, on demand. `create` gets an `onIdle`
 * callback: the instance calls it when it holds nothing any more, and its key
 * is forgotten.
 *
 * @internal
 */
export const byKey = <P, E extends EventMap, R>(
	key: (payload: P) => unknown,
	create: (onIdle: () => void) => Task<P, E, R>,
): Task<P, E, R> => {
	const instances = new Map<unknown, Task<P, E, R>>();

	return (payload, ctx) => {
		const id = key(payload);
		let instance = instances.get(id);

		if (!instance) {
			const made: Task<P, E, R> = create(() => {
				if (instances.get(id) === made) {
					instances.delete(id);
				}
			});
			instance = made;
			instances.set(id, made);
		}

		return instance(payload, ctx);
	};
};
