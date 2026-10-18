import { linkedController } from "../utils";
import type { Cancellable } from "./cancel";

/** Context passed into `race` / `all` effect starters. */
export type EffectContext = Cancellable & {
	signal: AbortSignal;
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
 * `unfollowParent` removes the abort listener from `parent`.
 */
export const startEffects = (effects: Starters, parent?: AbortSignal) => {
	parent?.throwIfAborted();
	const group = linkedController(parent);

	return {
		tasks: Object.entries(effects).map(([key, starter]) => {
			const { controller } = linkedController(group.controller.signal);
			const ctx: EffectContext = {
				signal: controller.signal,
				abort: (reason) => controller.abort(reason),
			};
			return [key, Promise.resolve().then(() => starter(ctx))] as const;
		}),
		cancelAll: () => group.controller.abort(),
		unfollowParent: group.unlink,
	};
};
