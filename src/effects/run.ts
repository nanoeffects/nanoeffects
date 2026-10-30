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

/**
 * A starter of a group on a bus with the events `E`, with the result `R`. A starter written in a
 * group needs no type: the group gives it. Use this for one kept in a variable, where nothing
 * tells the checker which bus it is for.
 *
 * @example
 * ```ts
 * const load: StarterOf<Events> = all({ user: retry(() => loadUser(1)) });
 * const user: StarterOf<Events, User> = retry(() => loadUser(1));
 *
 * bus.on("open", async (_, ctx) => race(ctx, { load, user }));
 * ```
 */
export type StarterOf<E extends EventMap, R = unknown> = Starter<R, Context<E>>;

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

/** Options of `all` and `allSettled`. */
export type GroupOptions = {
	/** At most this many starters run at once; the next starts when one settles. Default: no limit. */
	concurrency?: number | undefined;
};

/** Reads `concurrency` before anything starts: a positive integer, or `Infinity` for no limit. */
const concurrencyOf = (options: GroupOptions | null | undefined): number => {
	const value = options?.concurrency ?? Number.POSITIVE_INFINITY;
	if (
		value !== Number.POSITIVE_INFINITY &&
		!(Number.isInteger(value) && value >= 1)
	) {
		throw new RangeError("concurrency must be a positive integer");
	}

	return value;
};

/**
 * Like `startStarters`, but a starter is forked and called only when fewer than `limit` run. A
 * starter that never starts has no child task and no trace; its promise stays pending, and no one
 * waits for it once the group is over. After a failure (when `stopOnFailure`), an abort of the
 * group or `cancelAll`, no further starter starts.
 */
const startLimited = (
	group: Context<EventMap>,
	effects: Starters,
	limit: number,
	stopOnFailure: boolean,
) => {
	const entries = Object.entries(effects);
	const resolvers: Array<(task: Promise<unknown>) => void> = [];
	const tasks = entries.map(([key]) => {
		const task = new Promise<unknown>((resolve) => resolvers.push(resolve));

		return [key, task] as const;
	});
	const cancels = new Set<() => void>();
	let next = 0;
	let running = 0;
	let stopped = false;

	const launch = () => {
		while (
			!stopped &&
			!group.signal.aborted &&
			running < limit &&
			next < entries.length
		) {
			const index = next++;
			const [, starter] = entries[index] as [
				string,
				Starter<unknown, Context<EventMap>>,
			];
			const child = forkTask(group);
			const start = () => starter(child.ctx);
			const settle = () => {
				child.unlink();
				cancels.delete(child.ctx.abort);
				running--;
			};
			cancels.add(child.ctx.abort);
			running++;
			const task = new Promise((resolve) =>
				resolve(traceRun(child.ctx, "run", start)),
			).then(
				(value) => {
					settle();
					launch();

					return value;
				},
				(error: unknown) => {
					settle();
					stopped = stopOnFailure;
					launch();

					throw error;
				},
			);
			resolvers[index]?.(task);
		}
	};
	launch();

	return {
		tasks,
		cancelAll: () => {
			stopped = true;
			for (const cancel of cancels) {
				cancel();
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
	args:
		| [{ signal?: AbortSignal }, Starters, (GroupOptions | null | undefined)?]
		| [Starters],
	group: (
		ctx: { signal?: AbortSignal },
		effects: Starters,
		options?: GroupOptions | null,
	) => R,
): R | ((child: Context<EventMap>) => R) => {
	if (args.length !== 1) {
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
 * or whenever it is over (`race`). `options.concurrency` limits how many run at once.
 */
export const runGroup = <T>(
	effect: EffectName,
	ctx: { signal?: AbortSignal },
	effects: Starters,
	gather: (
		tasks: ReadonlyArray<readonly [string, Promise<unknown>]>,
	) => Promise<T>,
	cancelAfter: "failure" | "end",
	options?: GroupOptions | null,
): Promise<T> => {
	const limit = concurrencyOf(options);
	let cancelAll = () => {};

	return withGroup(
		effect,
		ctx,
		async (group) => {
			const started =
				limit === Number.POSITIVE_INFINITY
					? startStarters(group, effects)
					: startLimited(group, effects, limit, effect === "all");
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
