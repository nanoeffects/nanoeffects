import type { Effects } from "../core/effect-types";
import type { Scope, WithFields } from "../core/scope-types";
import type { EventMap } from "../core/types";
import type { BoundOf } from "../effects/plugin";

export type { Merge, WithFields } from "../core/scope-types";

/**
 * The slots `scopePlugin` fills for `modulePlugin`. They are not on `Bus`: a bus
 * has them in its type once the plugin returned it.
 */
export interface ScopeSlots {
	/** Puts the fields of a module's scope on the context of one of its tasks. Without it a module's scope is ignored. */
	applyScope?: ((ctx: object, scope: Scope) => void) | undefined;
	/** Wraps a handler so it runs with the fields of a module's scope. */
	fitScope?: ((scope: Scope, fn: unknown) => unknown) | undefined;
}

// the bound form of the `$effects` of a scope, if it has any
type BoundEffects<E extends EventMap, S extends Scope> = S extends {
	$effects: infer H extends Effects;
}
	? BoundOf<H, E>
	: unknown;

/** The fields a scope gives a task: its values as they are and its `$effects` bound; `unknown` for an empty scope. */
export type FieldsOfScope<E extends EventMap, S extends Scope> = [
	keyof S,
] extends [never]
	? unknown
	: Omit<S, "$effects"> & BoundEffects<E, S>;

/**
 * The event map `E` with the fields of a scope on top of its context fields.
 * A field the scope sets replaces the one of the bus in the type too.
 */
export type Scoped<E extends EventMap, S extends Scope> = WithFields<
	E,
	FieldsOfScope<E, S>
>;
