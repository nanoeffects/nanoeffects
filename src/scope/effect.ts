import type { Signaled, SignalFirst } from "../core/effect-types";

// the functions that `effect` was called with: `scopePlugin` binds these when they are values of a scope
export const marked = new WeakSet<object>();

/**
 * Marks a function whose first parameter is `{ signal }` as an effect, so that
 * as a value of a scope it is bound to the task: `ctx.first(items)`
 * calls `first(ctx, items)`. The type is the function without that parameter,
 * generics included, which `effects` cannot do: no annotation is needed, and
 * JavaScript editors show the exact hint.
 *
 * Only `scopePlugin` binds it; the function itself is returned unchanged.
 * Call it where the function is declared, not inline in the scope: TypeScript
 * does not infer the fields of a scope from a generic call written there.
 *
 * @example
 * ```ts
 * const first = effect(<T>(ctx: { signal: AbortSignal }, items: T[]) => items[0]);
 *
 * const getUser = createCommand(
 *   "user/get",
 *   (id: string, { first }) => first([id]), // first: <T>(items: T[]) => T
 *   { first },
 * );
 * ```
 */
export function effect<A extends unknown[], R>(
	fn: (ctx: Signaled, ...args: A) => R,
): (...args: A) => R;
// The type above says the function is already bound; the plugin binds it when it puts it on a task.
export function effect(fn: SignalFirst): unknown {
	marked.add(fn);

	return fn;
}
