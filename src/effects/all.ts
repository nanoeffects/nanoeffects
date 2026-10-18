import type { Starter, Starters } from "./run";
import { emptyResult, startEffects } from "./run";

/**
 * Runs all starters; waits for every result. On failure or parent abort, cancels the rest.
 *
 * @example
 * ```ts
 * bus.on("load", async (id, ctx) => {
 *   const { user, posts } = await all(
 *     {
 *       user: ({ signal }) => fetchUser(id, { signal }),
 *       posts: ({ signal }) => fetchPosts(id, { signal }),
 *     },
 *     ctx,
 *   );
 *
 *   // arrays work too: const [user, posts] = await all([getUser, getPosts], ctx);
 * });
 * ```
 */
export function all<T extends Record<string, Starter<unknown>>>(
	effects: T,
	ctx?: { signal?: AbortSignal },
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
export function all<T extends readonly Starter<unknown>[]>(
	effects: T,
	ctx?: { signal?: AbortSignal },
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
export async function all(
	effects: Starters,
	ctx?: { signal?: AbortSignal },
): Promise<unknown> {
	const run = startEffects(effects, ctx?.signal);

	try {
		const values = await Promise.all(run.tasks.map(([, task]) => task));
		const result = emptyResult(effects);
		for (const [index, [key]] of run.tasks.entries()) {
			result[key] = values[index];
		}
		return result;
	} catch (error) {
		run.cancelAll();
		throw error;
	} finally {
		run.unfollowParent();
	}
}
