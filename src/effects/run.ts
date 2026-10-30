import type { Context } from "../core/bus";
import { forkTask, traceRun } from "../core/context";
import type { EffectName, EventMap } from "../core/types";
import { isContext } from "../utils";
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
 * One argument is a group without a context, which is a starter; two are the `ctx` form. The count
 * tells them apart because effects and a context are both objects. A lone context is a mistake:
 * its `signal` is an object, and the value of an effects key is a starter, a function.
 */
export const groupOrStarter = <R>(
	args: [{ signal?: AbortSignal }, Starters] | [Starters],
	group: (ctx: { signal?: AbortSignal }, effects: Starters) => R,
): R | ((child: Context<EventMap>) => R) => {
	if (args.length === 2) {
		return group(...args);
	}
	const [effects] = args;
	if (isContext(Reflect.get(effects, "signal"))) {
		throw new TypeError(
			"A group takes effects: call it as (effects), or as (ctx, effects); a context alone has none",
		);
	}

	return (child) => group(child, effects);
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
