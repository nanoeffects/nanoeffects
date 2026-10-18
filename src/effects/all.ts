import type { Starter, Starters } from "./run";
import { emptyResult, startEffects } from "./run";

/**
 * Runs all starters; waits for every result. On failure or parent abort, cancels the rest.
 *
 * @example
 * ```ts
 * bus.on("load", async (id, ctx) => {
 *   const { user, posts } = await all(ctx, {
 *     user: ({ signal }) => fetchUser(id, { signal }),
 *     posts: ({ signal }) => fetchPosts(id, { signal }),
 *   });
 *
 *   // arrays work too: const [user, posts] = await all(ctx, [getUser, getPosts]);
 * });
 * ```
 */
export function all<T extends Record<string, Starter<unknown>>>(
	ctx: { signal?: AbortSignal },
	effects: T,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
export function all<T extends readonly Starter<unknown>[]>(
	ctx: { signal?: AbortSignal },
	effects: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
export async function all(
	ctx: { signal?: AbortSignal },
	effects: Starters,
): Promise<unknown> {
	const run = startEffects(effects, "all", ctx);

	try {
		const values = await run.until(
			Promise.all(run.tasks.map(([, task]) => task)),
		);
		const result = emptyResult(effects);
		for (const [index, [key]] of run.tasks.entries()) {
			result[key] = values[index];
		}
		run.settle("done");
		return result;
	} catch (error) {
		run.settle("error", error);
		run.cancelAll();
		throw error;
	} finally {
		run.unfollowParent();
	}
}
