import type { ContextOf } from "./bus";
import type { EventMap } from "./types";

/** What a function that makes the fields of a task gets to see. */
export type ContextTask = { type: string; payload?: unknown };

/**
 * `unknown` when none of the `fields` is already a context field of the bus,
 * else `never`: the call does not compile. Used as `bus: Bus<E> & NoClash<…>`.
 */
export type NoClash<Fields extends object, E extends EventMap> = [
	keyof Fields & keyof ContextOf<E>,
] extends [never]
	? unknown
	: never;
