import type { Context } from "../core/bus";
import { forkTask, traceRun } from "../core/context";
import type { EffectName, EventMap } from "../core/types";
import { withGroup } from "./group";

/** What a starter gets when the effect was called with `{}` or a bare `{ signal }`. */
export type EffectContext = {
	signal: AbortSignal;
	abort: (reason?: unknown) => void;
};

/**
 * What a starter gets: the context of its own child task when the effect was
 * called with a task context (so `take(child, event)` works), `{ signal, abort }`
 * otherwise.
 */
export type ChildOf<C> =
	C extends Context<infer E> ? Context<E> : EffectContext;

export type Starter<T, Child = EffectContext> = (
	child: Child,
) => T | PromiseLike<T>;

export type Starters =
	| Record<string, Starter<unknown, Context<EventMap>>>
	| readonly Starter<unknown, Context<EventMap>>[];

/** Empty result in the shape of `effects`: array of the same length, or object. */
export const emptyResult = (effects: Starters): Record<string, unknown> =>
	(Array.isArray(effects) ? Array(effects.length) : {}) as Record<
		string,
		unknown
	>;

/**
 * Starts every starter as a traced `run` child of `group`. `tasks` are their
 * promises by key, `cancelAll` aborts them all.
 */
export const startStarters = (group: Context<EventMap>, effects: Starters) => {
	const children = Object.entries(effects).map(([key, starter]) => {
		const child = forkTask(group);
		const start = () => starter(child.ctx);
		const task = new Promise((resolve) =>
			resolve(traceRun(child.ctx, "run", start)),
		).finally(child.unlink);

		return { key, task, cancel: child.ctx.abort };
	});

	return {
		tasks: children.map(({ key, task }) => [key, task] as const),
		cancelAll: () => {
			for (const child of children) {
				child.cancel();
			}
		},
	};
};

/**
 * What `all`, `allSettled` and `race` share: run the starters as one traced
 * group of `ctx`, and gather their promises with `gather`. `cancelAfter` tells
 * when the starters still running are cancelled: when the group failed (`all`),
 * or whenever it is over (`race`).
 */
export const runGroup = <T>(
	effect: EffectName,
	ctx: { signal?: AbortSignal },
	effects: Starters,
	gather: (
		tasks: ReadonlyArray<readonly [string, Promise<unknown>]>,
	) => Promise<T>,
	cancelAfter: "failure" | "end",
): Promise<T> => {
	let cancelAll = () => {};

	return withGroup(
		effect,
		ctx,
		async (group) => {
			const started = startStarters(group, effects);
			cancelAll = started.cancelAll;

			return gather(started.tasks);
		},
		(failed) => {
			if (failed || cancelAfter === "end") {
				cancelAll();
			}
		},
	);
};
