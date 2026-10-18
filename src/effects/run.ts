import { createSettle, forkTask, traceRun, traceTask } from "../context";
import type { EffectName, EventMap } from "../types";
import { onAbort } from "../utils";

/** Context passed into `race` / `all` effect starters. */
export type EffectContext = {
	signal: AbortSignal;
	abort: (reason?: unknown) => void;
};

export type Starter<T> = (ctx: EffectContext) => T | PromiseLike<T>;

export type Starters =
	| Record<string, Starter<unknown>>
	| readonly Starter<unknown>[];

/** Empty result in the shape of `effects`: array of the same length, or object. */
export const emptyResult = (effects: Starters): Record<string, unknown> =>
	(Array.isArray(effects) ? Array(effects.length) : {}) as Record<
		string,
		unknown
	>;

/**
 * Starts every starter under one group that follows `parent`; throws
 * `parent.reason` if it is already aborted. `cancelAll` aborts every effect,
 * `unfollowParent` removes the abort listener from `parent`, `settle` reports
 * how the group ended, `until` makes a wait end when `parent` aborts. When
 * `parent` is a bus task, the group (`effect`) and each starter (`run`) are
 * traced.
 */
export const startEffects = (
	effects: Starters,
	effect: EffectName,
	parent?: { signal?: AbortSignal },
) => {
	parent?.signal?.throwIfAborted();
	const group = forkTask<EventMap>(parent ?? {});
	const settle = createSettle(group.ctx, effect);

	traceTask(group.ctx, effect, "start");
	onAbort(() => settle("cancel"), group.ctx);

	/** Settles like `work`, but rejects with the reason as soon as `parent` aborts. */
	const until = <T>(work: Promise<T>): Promise<T> =>
		parent?.signal
			? new Promise<T>((resolve, reject) => {
					const off = onAbort(reject, parent);
					work.then(resolve, reject).finally(off);
				})
			: work;

	return {
		tasks: Object.entries(effects).map(([key, starter]) => {
			const child = forkTask(group.ctx);
			const ctx: EffectContext = {
				signal: child.ctx.signal,
				abort: child.ctx.abort,
			};

			return [
				key,
				Promise.resolve()
					.then(() => traceRun(child.ctx, "run", () => starter(ctx)))
					.finally(child.unlink),
			] as const;
		}),
		cancelAll: () => group.ctx.abort(),
		unfollowParent: group.unlink,
		settle,
		until,
	};
};
