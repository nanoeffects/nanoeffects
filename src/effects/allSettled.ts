import type { Starter, Starters } from "./run";
import { emptyResult, runGroup } from "./run";

const settled = (
	task: Promise<unknown>,
): Promise<PromiseSettledResult<unknown>> =>
	task.then(
		(value) => ({ status: "fulfilled", value }),
		(reason: unknown) => ({ status: "rejected", reason }),
	);

/**
 * Runs all starters and waits for every one to settle, whether it succeeds or
 * fails: nothing is cancelled when a starter fails. The result has, for each
 * starter, `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`.
 * Only an abort of `ctx` rejects it, with the abort reason.
 *
 * @example
 * ```ts
 * bus.on("load", async (id, ctx) => {
 *   const { user, posts } = await allSettled(ctx, {
 *     user: ({ signal }) => fetchUser(id, { signal }),
 *     posts: ({ signal }) => fetchPosts(id, { signal }),
 *   });
 *
 *   if (user.status === "fulfilled") render(user.value);
 * });
 * ```
 */
export function allSettled<T extends Record<string, Starter<unknown>>>(
	ctx: { signal?: AbortSignal },
	effects: T,
): Promise<{
	[K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
}>;
export function allSettled<const T extends readonly Starter<unknown>[]>(
	ctx: { signal?: AbortSignal },
	effects: T,
): Promise<{
	-readonly [K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
}>;
export function allSettled(
	ctx: { signal?: AbortSignal },
	effects: Starters,
): Promise<unknown> {
	return runGroup(
		"allSettled",
		ctx,
		effects,
		async (tasks) => {
			const outcomes = await Promise.all(
				tasks.map(([, task]) => settled(task)),
			);
			const result = emptyResult(effects);
			for (const [index, [key]] of tasks.entries()) {
				result[key] = outcomes[index];
			}

			return result;
		},
		"failure",
	);
}
