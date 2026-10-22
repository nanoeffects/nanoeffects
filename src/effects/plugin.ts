import type { Bus, WithContext } from "../core/bus";
import type { NoClash } from "../core/context-plugin";
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

type Results = Record<string, Starter<unknown>>;
type List = readonly Starter<unknown>[];

/** Each supported effect without its leading `ctx` argument. `take` knows the events of the bus. */
type Bound<E extends EventMap> = {
	race: {
		<T extends Results>(
			effects: T,
		): Promise<{ [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
		<const T extends List>(
			effects: T,
		): Promise<{ -readonly [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
	};
	all: {
		<T extends Results>(
			effects: T,
		): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
		<const T extends List>(
			effects: T,
		): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
	};
	allSettled: {
		<T extends Results>(
			effects: T,
		): Promise<{
			[K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
		}>;
		<const T extends List>(
			effects: T,
		): Promise<{
			-readonly [K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
		}>;
	};
	take: <K extends Keys<E>>(
		event: K,
		options?: TakeOptions<E[K]>,
	) => Promise<E[K]>;
	delay: (ms: number | (() => number)) => Promise<void>;
};

type Helpers = Partial<Supported>;

type BoundOf<H extends Helpers, E extends EventMap> = {
	[K in keyof H & keyof Bound<E>]: Bound<E>[K];
};

type Effect = (ctx: object, ...args: unknown[]) => unknown;

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
		const entries = Object.entries(helpers) as Array<[string, Effect]>;

		bus.addContext = (ctx) => {
			previous?.(ctx);
			for (const [key, effect] of entries) {
				Object.assign(ctx, {
					[key]: (...args: unknown[]) => effect(ctx, ...args),
				});
			}
		};

		return bus as Bus<E & WithContext<BoundOf<H, E>>>;
	};
