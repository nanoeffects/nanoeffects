import type { Context } from "../bus";
import { createSettle, forkTask, traceRun, traceTask } from "../context";
import type { EffectName, EventMap } from "../types";
import { onAbort, raceAbort } from "../utils";

/**
 * Runs `body` as one traced group (`effect`) under `parent`. The group is a
 * child task: it aborts with `parent`, and the result rejects with the abort
 * reason as soon as `parent` aborts. Throws that reason at once if `parent` is
 * already aborted.
 */
export const withGroup = async <T>(
	effect: EffectName,
	parent: { signal?: AbortSignal | undefined } | undefined,
	body: (group: Context<EventMap>) => Promise<T>,
): Promise<T> => {
	parent?.signal?.throwIfAborted();
	const { ctx: group, unlink } = forkTask<EventMap>(parent ?? {});
	const settle = createSettle(group, effect);

	traceTask(group, effect, "start");
	onAbort(group, () => settle("cancel"));

	try {
		const value = await raceAbort(body(group), parent);
		settle("done");
		return value;
	} catch (error) {
		settle("error", error);
		throw error;
	} finally {
		unlink();
	}
};

/** Runs `fn` as a traced `run` child of `group`. */
export const runTraced = async <T>(
	group: Context<EventMap>,
	fn: () => T | PromiseLike<T>,
): Promise<T> => {
	const { ctx, unlink } = forkTask(group);

	try {
		return await traceRun(ctx, "run", fn);
	} finally {
		unlink();
	}
};
