import type { ChildOf, GroupOptions, Starter, Starters } from "./run";
import { emptyResult, groupOrStarter, runGroup } from "./run";

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
export function allSettled<
	C extends { signal?: AbortSignal },
	T extends Record<string, Starter<unknown, ChildOf<C>>>,
>(
	ctx: C,
	effects: T,
	options?: GroupOptions | null,
): Promise<{
	[K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
}>;
export function allSettled<
	C extends { signal?: AbortSignal },
	const T extends readonly Starter<unknown, ChildOf<C>>[],
>(
	ctx: C,
	effects: T,
	options?: GroupOptions | null,
): Promise<{
	-readonly [K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
}>;
// Without a context the call is a starter. The child type comes from the group that calls it.
export function allSettled<
	Child,
	T extends Record<string, Starter<unknown, Child>>,
>(
	effects: T,
): (child: Child) => Promise<{
	[K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
}>;
export function allSettled<
	Child,
	const T extends readonly Starter<unknown, Child>[],
>(
	effects: T,
): (child: Child) => Promise<{
	-readonly [K in keyof T]: PromiseSettledResult<Awaited<ReturnType<T[K]>>>;
}>;
export function allSettled(
	...args:
		| [{ signal?: AbortSignal }, Starters, (GroupOptions | null | undefined)?]
		| [Starters]
) {
	return groupOrStarter(args, allSettledOf);
}

const allSettledOf = (
	ctx: { signal?: AbortSignal },
	effects: Starters,
	options?: GroupOptions | null,
): Promise<unknown> =>
	runGroup(
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
		options,
	);
