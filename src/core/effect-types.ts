/** What an effect needs of the task it runs for: its signal. A task context fits, and so does `{ signal }`. */
export type Signaled = { signal: AbortSignal };

/** An effect: a function whose first parameter takes `{ signal }`, like `retry(ctx, fn)`. */
export type SignalFirst = (ctx: Signaled, ...args: never[]) => unknown;

/** The effects of a scope or of `effectsPlugin`, by the name they get on the context. */
export type Effects = Record<string, SignalFirst>;

// only the type of this key is used: it never exists at run time
declare const bound: unique symbol;

/**
 * An effect that says what it looks like once it is bound to a task (without
 * the `ctx` parameter). A plain effect has its first parameter removed, which
 * erases its generics; this type keeps them, because `F` is carried as it is.
 * It changes the checker only: the function is the same at run time.
 *
 * @example
 * ```ts
 * type First = <T>(items: T[]) => T; // how a handler calls it
 * const first: Effect<First> = (ctx, items) => items[0];
 * ```
 */
export type Effect<F extends (...args: never[]) => unknown> = ((
	ctx: Signaled,
	...args: Parameters<F>
) => ReturnType<F>) & { readonly [bound]?: F };

/** The bound form of a plain effect: the first parameter is gone, and so are its generics. */
export type Strip<F> = F extends (ctx: never, ...args: infer A) => infer R
	? (...args: A) => R
	: never;

/** The bound type an `Effect<F>` carries, or `Strip` of a plain function. */
export type BoundForm<F> = typeof bound extends keyof F
	? NonNullable<F[typeof bound & keyof F]>
	: Strip<F>;
