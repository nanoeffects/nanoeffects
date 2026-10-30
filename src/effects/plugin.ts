import type { ActionCreator, FreeActionCreator } from "../core/action-creator";
import type { Bus, Context, WithContext } from "../core/bus";
import type { NoClash } from "../core/context-types";
import type { BoundForm, Effects } from "../core/effect-types";
import type { EventMap, Keys } from "../core/types";
import type { delay } from "../utils";
import type { all } from "./all";
import type { allSettled } from "./allSettled";
import type { race } from "./race";
import type { Starter } from "./run";
import type { TakeOptions, take } from "./take";

/** The effects that `effectsPlugin` can put on `ctx`. */
type Supported = {
	race: typeof race;
	all: typeof all;
	allSettled: typeof allSettled;
	take: typeof take;
	delay: typeof delay;
};

/** Each supported effect without its leading `ctx` argument. `take` knows the events of the bus. */
type Bound<E extends EventMap, Child> = {
	race: {
		<T extends Record<string, Starter<unknown, Child>>>(
			effects: T,
		): Promise<{ [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
		<const T extends readonly Starter<unknown, Child>[]>(
			effects: T,
		): Promise<{ -readonly [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
	};
	all: {
		<T extends Record<string, Starter<unknown, Child>>>(
			effects: T,
		): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
		<const T extends readonly Starter<unknown, Child>[]>(
			effects: T,
		): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
	};
	allSettled: {
		<T extends Record<string, Starter<unknown, Child>>>(
			effects: T,
		): Promise<{
			[K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
		}>;
		<const T extends readonly Starter<unknown, Child>[]>(
			effects: T,
		): Promise<{
			-readonly [K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
		}>;
	};
	take: {
		<K extends Keys<E>>(event: K, options?: TakeOptions<E[K]>): Promise<E[K]>;
		/** A creator without a payload type: the payload comes from the event map. */
		<K extends Keys<E>>(
			creator: FreeActionCreator<K>,
			options?: TakeOptions<E[K]>,
		): Promise<E[K]>;
		<P>(creator: ActionCreator<P>, options?: TakeOptions<P>): Promise<P>;
	};
	delay: (ms: number | (() => number)) => Promise<void>;
};

/** Any function whose first parameter takes `{ signal }` can go on the context, not only the built-in ones. */
type Helpers = Effects;

/**
 * The effects as a handler sees them: the built-in ones keep their hand-written
 * types, any other loses its first parameter, or has the type `Effect<F>` says.
 */
export type BoundOf<H extends Helpers, E extends EventMap> = {
	[K in keyof H]: K extends keyof Bound<E, StarterOf<H, E>>
		? H[K] extends Supported[K]
			? Bound<E, StarterOf<H, E>>[K]
			: BoundForm<H[K]>
		: BoundForm<H[K]>;
};

/** What a starter of a bound `race` / `all` / `allSettled` gets: the context of its child, with the same bound effects. */
type StarterOf<H extends Helpers, E extends EventMap> = Context<E> &
	BoundOf<H, E>;

type Run = (ctx: object, ...args: unknown[]) => unknown;

// A function this plugin bound carries its effect under this key: a child made from a context
// gets the fields of its parent, and takes back its own functions to bind them to itself.
// A property of the function, not a WeakMap: this runs for every task and every fork.
const effectKey = Symbol("nanoeffects.effects.effect");
type BoundFunction = ((...args: unknown[]) => unknown) & { [effectKey]?: Run };

/**
 * Puts the effects you pass on the context of every task of the bus, bound to
 * that task, so a handler can write `({ race })` instead of `race(ctx, …)`.
 * The key is the name of the effect: `race`, `all`, `allSettled`, `take`,
 * `delay`. Returns the same bus, typed with the new fields.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { all, delay, effectsPlugin, race } from "nanoeffects/effects";
 *
 * const bus = createBus().use(effectsPlugin({ race, delay }));
 *
 * bus.on("load", async (id, { race, delay }) => {
 *   const result = await race({
 *     data: ({ signal }) => fetchData(id, { signal }),
 *     timeout: () => delay(5000),
 *   });
 * });
 * ```
 */
export const effectsPlugin =
	<H extends Helpers>(helpers: H) =>
	<E extends EventMap>(
		bus: Bus<E> & NoClash<BoundOf<H, E>, E>,
	): Bus<E & WithContext<BoundOf<H, E>>> => {
		const previous = bus.addContext;
		const entries = Object.entries(helpers) as Array<[string, Run]>;

		bus.addContext = (ctx) => {
			previous?.(ctx);
			for (const [key, effect] of entries) {
				// a field that is there stays (a scope put it), so the order of the plugins does not matter;
				// one of ours that a parent had is bound again, to this context
				const current: BoundFunction | undefined = Reflect.get(ctx, key);
				if (current === void 0 || current[effectKey] === effect) {
					const bound: BoundFunction = (...args) => effect(ctx, ...args);
					bound[effectKey] = effect;
					Reflect.set(ctx, key, bound);
				}
			}
		};

		return bus as Bus<E & WithContext<BoundOf<H, E>>>;
	};
