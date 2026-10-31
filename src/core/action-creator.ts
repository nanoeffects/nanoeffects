import type { Carrying } from "./scope-types";
import type { EventMap, Keys, PayloadOf } from "./types";

export type WithPayload<E extends EventMap, K extends Keys<E>> =
	undefined extends DataOf<E[K]>
		? { type: K; payload?: DataOf<E[K]> }
		: { type: K; payload: DataOf<E[K]> };

// A `void` payload is an absent one, and an absent payload is `undefined` in
// an object, which is what the bus expects of an event without data.
// biome-ignore lint/suspicious/noConfusingVoidType: `void` is what is detected
type Absent<P> = [P] extends [void] ? undefined : P;

// The action of a creator, as an event of the bus sees it.
type Made<P, T extends string> = WithPayload<{ [K in T]: Absent<P> }, T>;

// only the type of this key is used: it carries the payload and the result of a `Call`
declare const callBrand: unique symbol;

/**
 * A payload type together with the type of what a handler of the action
 * returns, for an event map or `createAction`:
 * `type Events = { "user/getId": Call<void, string> }`, and then
 * `bus.emit("user/getId")` is a `string`. A type only: it adds nothing to a
 * bundle, and an entry that is not a `Call` means a payload, with no result.
 */
export type Call<P = void, R = void> = {
	readonly [callBrand]: { payload: P; result: R };
};

/** The payload type of an entry of an event map: the `P` of a `Call<P, R>`, the entry itself otherwise. */
export type DataOf<T> = T extends Call<infer P, unknown> ? P : T;

/** What `emit` returns for an entry of an event map: the `R` of a `Call<P, R>`, `void` otherwise. */
// biome-ignore lint/suspicious/noConfusingVoidType: `void` is the result of an entry that is not a `Call`; `undefined` is a different type
export type ResultOf<T> = T extends Call<unknown, infer R> ? R : void;

// only the type of this key is used: it marks "the payload type was not given"
declare const free: unique symbol;
export type Free = typeof free;

/**
 * A creator whose payload type was not given: each call has the type of what
 * it is given, and the bus checks it against its event map, so
 * `createAction("user/loaded")` needs no generics and keeps its literal type.
 */
export interface FreeActionCreator<T extends string, F = unknown> {
	(): Carrying<{ type: T; payload: undefined }, F>;
	<P>(payload: P): Carrying<{ type: T; payload: P }, F>;
	readonly type: T;
	/** Tells whether an action is one of this creator. */
	match(action: { type: string; payload?: unknown }): action is {
		type: T;
		payload: unknown;
	};
	toString(): T;
}

/**
 * Makes actions of one type. It also works as the event of that type:
 * `bus.on(creator, fn)` and `bus.emit(creator(payload))`.
 */
export interface ActionCreator<
	P = void,
	T extends string = string,
	A extends unknown[] = PayloadOf<P>,
	F = unknown,
> {
	(...args: A): Carrying<Made<P, T>, F>;
	readonly type: T;
	/** Tells whether an action is one of this creator, and narrows its type. */
	match(action: { type: string; payload?: unknown }): action is Made<P, T>;
	toString(): T;
}
