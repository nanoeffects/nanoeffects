import type { ChildOf, Starter, Starters } from "./run";
import { emptyResult, groupOrStarter, runGroup } from "./run";

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
export function all<
	C extends { signal?: AbortSignal },
	T extends Record<string, Starter<unknown, ChildOf<C>>>,
>(ctx: C, effects: T): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
export function all<
	C extends { signal?: AbortSignal },
	const T extends readonly Starter<unknown, ChildOf<C>>[],
>(
	ctx: C,
	effects: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
// Without a context the call is a starter. The child type comes from the group that calls it.
export function all<Child, T extends Record<string, Starter<unknown, Child>>>(
	effects: T,
): (child: Child) => Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
export function all<Child, const T extends readonly Starter<unknown, Child>[]>(
	effects: T,
): (
	child: Child,
) => Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
export function all(
	...args: [{ signal?: AbortSignal }, Starters] | [Starters]
) {
	return groupOrStarter(args, allOf);
}

const allOf = (
	ctx: { signal?: AbortSignal },
	effects: Starters,
): Promise<unknown> =>
	runGroup(
		"all",
		ctx,
		effects,
		async (tasks) => {
			const values = await Promise.all(tasks.map(([, task]) => task));
			const result = emptyResult(effects);
			for (const [index, [key]] of tasks.entries()) {
				result[key] = values[index];
			}

			return result;
		},
		"failure",
	);
