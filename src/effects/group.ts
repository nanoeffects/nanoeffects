import type { Context } from "../core/bus";
import { createSettle, forkTask, traceRun, traceTask } from "../core/context";
import type { EffectName, EventMap, Task } from "../core/types";
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
	// called once the group has reported its end, with whether it failed
	afterSettle?: (failed: boolean) => void,
): Promise<T> => {
	parent?.signal?.throwIfAborted();
	const { ctx: group, unlink } = forkTask<EventMap>(parent ?? {});
	const settle = createSettle(group, effect);

	traceTask(group, effect, "start");
	onAbort(group, () => settle("cancel"));

	try {
		const value = await raceAbort(body(group), parent);
		settle("done");
		afterSettle?.(false);
		return value;
	} catch (error) {
		settle("error", error);
		afterSettle?.(true);
		throw error;
	} finally {
		unlink();
	}
};

/** Runs `fn` as a traced `run` child of `group`; `fn` gets the context of that child. */
export const runTraced = async <T>(
	group: Context<EventMap>,
	fn: (child: Context<EventMap>) => T | PromiseLike<T>,
): Promise<T> => {
	const { ctx, unlink } = forkTask(group);

	try {
		return await traceRun(ctx, "run", () => fn(ctx));
	} finally {
		unlink();
	}
};

/**
 * A child task has the bus of its parent, so it is a `Context<E>` for the
 * events `E` that the parent was a context of; the types of a group do not
 * carry `E`.
 */
export const asContextOf = <E extends EventMap>(
	child: Context<EventMap>,
): Context<E> => child as Context<E>;

/** The body of a Task form: calls `task` with the payload and the context of the child it is given. */
export const bodyOf =
	<R>(task: Task<unknown, EventMap, R>, payload: unknown) =>
	(child: Context<EventMap>) =>
		task(payload, asContextOf(child));
