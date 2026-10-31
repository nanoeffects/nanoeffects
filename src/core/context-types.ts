import type { ContextOf } from "./bus";
import type { signalFieldKey } from "./signal-field-key";
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

/**
 * A context field that is made from the signal of each task, on its first read.
 * Made by `fromSignal` in `nanoeffects/signal`; `contextPlugin` puts the made value on `ctx`.
 */
export type FromSignal<T> = {
	readonly [signalFieldKey]: (signal: AbortSignal) => T;
};

/** `Fields` as `ctx` has them: a `FromSignal<T>` field is its `T`. */
export type Resolved<Fields extends object> = {
	[K in keyof Fields]: Fields[K] extends FromSignal<infer T> ? T : Fields[K];
};
