import type { Starter, Starters } from "./run";
import { emptyResult, startEffects } from "./run";

export type RaceStarter<T> = Starter<T>;

/**
 * Runs all starters; first to settle wins, losers are cancelled via `ctx.abort`.
 * The result holds only the winner's value, under its key or index.
 *
 * @example
 * ```ts
 * bus.on("load", async (id, ctx) => {
 *   const result = await race(
 *     {
 *       data: ({ signal }) => fetchData(id, { signal }),
 *       timeout: ({ signal }) => delay(5000, { signal }),
 *     },
 *     ctx,
 *   );
 *
 *   if ("timeout" in result) throw new Error("timed out");
 *   render(result.data);
 * });
 * ```
 */
export function race<T extends Record<string, RaceStarter<unknown>>>(
	effects: T,
	ctx?: { signal?: AbortSignal },
): Promise<{ [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
export function race<T extends readonly RaceStarter<unknown>[]>(
	effects: T,
	ctx?: { signal?: AbortSignal },
): Promise<{ -readonly [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
export async function race(
	effects: Starters,
	ctx?: { signal?: AbortSignal },
): Promise<unknown> {
	const result = emptyResult(effects);
	if (Object.keys(effects).length === 0) {
		return result;
	}

	const run = startEffects(effects, ctx?.signal);

	try {
		const [key, value] = await Promise.race(
			run.tasks.map(([key, task]) =>
				task.then((value) => [key, value] as const),
			),
		);
		result[key] = value;
		return result;
	} finally {
		run.unfollowParent();
		run.cancelAll();
	}
}
