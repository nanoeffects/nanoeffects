import type { Effects } from "../core/effect-types";
import type { Scope, WithFields } from "../core/scope-types";
import type { EventMap } from "../core/types";
import type { BoundOf } from "../effects/plugin";

export type { Merge, WithFields } from "../core/scope-types";

// the bound form of the `effects` of a scope, if it has any
type BoundEffects<E extends EventMap, S extends Scope> = S extends {
	effects: infer H extends Effects;
}
	? BoundOf<H, E>
	: unknown;

/** The fields a scope gives a task: its values as they are and its `effects` bound; `unknown` for an empty scope. */
export type FieldsOfScope<E extends EventMap, S extends Scope> = [
	keyof S,
] extends [never]
	? unknown
	: Omit<S, "effects"> & BoundEffects<E, S>;

/**
 * The event map `E` with the fields of a scope on top of its context fields.
 * A field the scope sets replaces the one of the bus in the type too.
 */
export type Scoped<E extends EventMap, S extends Scope> = WithFields<
	E,
	FieldsOfScope<E, S>
>;
