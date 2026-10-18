import { forkTask, hasTask, traceRun, traceTask } from "../context";
import type { EffectName, Phase } from "../types";
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

const openGroup = (parent?: { signal?: AbortSignal }) => {
	if (parent && hasTask(parent)) {
		const { ctx, unlink } = forkTask(parent);
		return { signal: ctx.signal, abort: ctx.abort, unlink, ctx };
	}

	const { controller, unlink } = linkedController(parent?.signal);
	return {
		signal: controller.signal,
		abort: (reason?: unknown) => controller.abort(reason),
		unlink,
		ctx: null,
	};
};

/**
 * Starts every starter under one group that follows `parent`; throws
 * `parent.reason` if it is already aborted. `cancelAll` aborts every effect,
 * `unfollowParent` removes the abort listener from `parent`, `settle` reports
 * how the group ended, `until` makes a wait end when `parent` aborts. When `parent` is a bus task, the group and each starter
 * are traced (`effect` for the group, `run` for starters).
 */
export const startEffects = (
	effects: Starters,
	effect: EffectName,
	parent?: { signal?: AbortSignal },
) => {
	parent?.signal?.throwIfAborted();
	const group = openGroup(parent);
	const groupCtx = group.ctx;

	let settled = false;
	const settle = (phase: Phase, error?: unknown) => {
		if (!settled && groupCtx) {
			settled = true;
			traceTask(groupCtx, effect, phase, error);
		}
	};

	if (groupCtx) {
		group.signal.addEventListener("abort", () => settle("cancel"), {
			once: true,
		});
		traceTask(groupCtx, effect, "start");
	}

	/** Settles like `work`, but rejects with the reason as soon as `parent` aborts. */
	const until = <T>(work: Promise<T>): Promise<T> => {
		const signal = parent?.signal;
		if (!signal) {
			return work;
		}

		return new Promise<T>((resolve, reject) => {
			const onAbort = () => reject(signal.reason);
			signal.addEventListener("abort", onAbort, { once: true });
			work
				.then(resolve, reject)
				.finally(() => signal.removeEventListener("abort", onAbort));
		});
	};

	return {
		tasks: Object.entries(effects).map(([key, starter]) => {
			if (groupCtx) {
				const child = forkTask(groupCtx);
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
			}

			const { controller } = linkedController(group.signal);
			const ctx: EffectContext = {
				signal: controller.signal,
				abort: (reason) => controller.abort(reason),
			};
			return [key, Promise.resolve().then(() => starter(ctx))] as const;
		}),
		cancelAll: () => group.abort(),
		unfollowParent: group.unlink,
		settle,
		until,
	};
};
