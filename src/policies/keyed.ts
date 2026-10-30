import type { EventMap, Task } from "../core/types";
import { reporting } from "./lifecycle";

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
 * Tells the two forms of a policy apart: with a task (`first` is a function)
 * the policy is built at once, without one (`first` holds the options) a
 * wrapper that takes the task is returned.
 *
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: the implementation signature of an overloaded policy takes every form
export type Loose = any;

export const formOf = (
	first: Loose,
	second: Loose,
	build: (fn: Loose, options: Loose) => unknown,
): unknown => {
	if (typeof first === "function") {
		return build(first, second ?? {});
	}
	return (fn: unknown) => build(fn, first ?? {});
};

/** Options of a policy called without a task: `key` is left out. */
export type Unkeyed<O> = Omit<O, "key"> & { key?: undefined };

/** Options of a policy called without a task, with a `key` that tells the payload type. */
export type Keyed<O, P> = O & { key: (payload: P) => unknown };

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

/**
 * A policy with an instance per key when `key` is given, one instance
 * otherwise. `create` makes an instance; it gets `onIdle`, to be called when
 * the instance holds nothing any more.
 *
 * @internal
 */
export const keyed = <P, E extends EventMap, R>(
	key: ((payload: P) => unknown) | undefined,
	create: (onIdle: () => void) => Task<P, E, R>,
): Task<P, E, R> => reporting(key ? byKey(key, create) : create(noop));
