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
export function race<T extends Record<string, RaceStarter<unknown>>>(
	ctx: { signal?: AbortSignal },
	effects: T,
): Promise<{ [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
export function race<const T extends readonly RaceStarter<unknown>[]>(
	ctx: { signal?: AbortSignal },
	effects: T,
): Promise<{ -readonly [K in keyof T]?: Awaited<ReturnType<T[K]>> }>;
export async function race(
	ctx: { signal?: AbortSignal },
	effects: Starters,
): Promise<unknown> {
	const result = emptyResult(effects);
	if (Object.keys(effects).length === 0) {
		return result;
	}

	const run = startEffects(effects, "race", ctx);

	try {
		const [key, value] = await run.until(
			Promise.race(
				run.tasks.map(([key, task]) =>
					task.then((value) => [key, value] as const),
				),
			),
		);
		result[key] = value;
		run.settle("done");
		return result;
	} catch (error) {
		run.settle("error", error);
		throw error;
	} finally {
		run.unfollowParent();
		run.cancelAll();
	}
}
