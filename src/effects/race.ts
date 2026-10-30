import type { ChildOf, EffectContext, Starter, Starters } from "./run";
import { emptyResult, groupOrStarter, runGroup } from "./run";

export type RaceStarter<T, Child = EffectContext> = Starter<T, Child>;

/**
 * Runs all starters; first to settle wins, losers are cancelled via `ctx.abort`.
 * The result holds only the winner's value, under its key or index.
 *
 * @example
 * ```ts
 * bus.on("load", async (id, ctx) => {
 *   const result = await race(ctx, {
 *     data: ({ signal }) => fetchData(id, { signal }),
 *     timeout: ({ signal }) => delay({ signal }, 5000),
 *   });
 *
 *   if ("timeout" in result) throw new Error("timed out");
 *   render(result.data);
 * });
 * ```
 */
export function race<
	C extends { signal?: AbortSignal },
	T extends Record<string, RaceStarter<unknown, ChildOf<C>>>,
>(ctx: C, effects: T): Promise<{ [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
export function race<
	C extends { signal?: AbortSignal },
	const T extends readonly RaceStarter<unknown, ChildOf<C>>[],
>(
	ctx: C,
	effects: T,
): Promise<{ -readonly [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
// Without a context the call is a starter. The child type comes from the group that calls it.
export function race<
	Child,
	T extends Record<string, RaceStarter<unknown, Child>>,
>(
	effects: T,
): (child: Child) => Promise<{ [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
export function race<
	Child,
	const T extends readonly RaceStarter<unknown, Child>[],
>(
	effects: T,
): (
	child: Child,
) => Promise<{ -readonly [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
export function race(
	...args: [{ signal?: AbortSignal }, Starters] | [Starters]
) {
	return groupOrStarter(args, raceOf);
}

const raceOf = (
	ctx: { signal?: AbortSignal },
	effects: Starters,
): Promise<unknown> => {
	const result = emptyResult(effects);
	if (Object.keys(effects).length === 0) {
		return Promise.resolve(result);
	}

	return runGroup(
		"race",
		ctx,
		effects,
		async (tasks) => {
			const [key, value] = await Promise.race(
				tasks.map(([key, task]) => task.then((value) => [key, value] as const)),
			);
			result[key] = value;

			return result;
		},
		"end",
	);
};
