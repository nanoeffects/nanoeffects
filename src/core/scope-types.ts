import type { ContextOf, WithContext } from "./bus";
import type { Effects } from "./effect-types";
import type { EventMap } from "./types";

// only the type of this key is used: it carries the context fields of a scope
declare const scopeFields: unique symbol;

/** What an action creator, a command or a call knows of the scope it was made with: its fields, for the checker. */
export type WithScope<F> = { readonly [scopeFields]: F };

/** `X`, marked with the scope fields `F` it carries; `X` itself when there are none, so unscoped types stay as they were. */
export type Carrying<X, F> = X &
	([unknown] extends [F] ? unknown : WithScope<F>);

/** The context fields of a scope that a call carries; `unknown` when it has none. */
export type FieldsOf<X> = X extends { readonly [scopeFields]: infer F }
	? unknown extends F
		? unknown
		: NonNullable<F>
	: unknown;

/**
 * What a task gets on top of the context of its bus, for one place: every key
 * is a context value and goes on `ctx` as it is, except `$effects`, whose
 * functions (each takes `{ signal }` first) are bound to the task. Made work by
 * `scopePlugin` from `nanoeffects/scope`; without it a scope is ignored.
 *
 * @example
 * ```ts
 * const scope = { cache, $effects: { race } }; // ctx.cache, and ctx.race bound to the task
 * ```
 */
export type Scope = {
	readonly $effects?: Effects;
	readonly [field: string]: unknown;
};

/**
 * What a call may replace of what it already has: the fields of the bus and
 * those of its own scope, and its effects. The types must match the ones they
 * replace; a field that neither declares has no type to check against, so it is
 * an error.
 */
export type EmitScope<E extends EventMap, F = unknown> = ([unknown] extends [
	ContextOf<E> & F,
]
	? unknown
	: Partial<ContextOf<E> & F>) & { $effects?: Partial<Effects> };

/** `A` with the fields of `B` replacing those of the same name, not intersected with them. */
export type Merge<A, B> = Omit<A, keyof B> & B;

/**
 * The event map `E` with the fields `F` of a scope on top of its context
 * fields; `E` itself when there are none. A field of the scope replaces the
 * one of the bus in the type too.
 */
export type WithFields<E extends EventMap, F> = [unknown] extends [F]
	? E
	: Omit<E, keyof WithContext<object>> & WithContext<Merge<ContextOf<E>, F>>;
