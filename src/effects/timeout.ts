import type { Context } from "../core/bus";
import { forkTask, traceRun } from "../core/context";
import type { EventMap, Task } from "../core/types";
import { clearTimer, raceAbort, setTimer } from "../utils";
import { bodyOf, withGroup } from "./group";
import type { ChildOf, Starter } from "./run";
import { runTaskOrStarter, type Startable } from "./starter-call";

// What `timeout` does for both of its forms: `run` gets the child that the time limit aborts
const timeoutBody = <T>(
	ctx: { signal?: AbortSignal },
	ms: number,
	run: (child: Context<EventMap>) => T | PromiseLike<T>,
): Promise<T> =>
	withGroup("timeout", ctx, async (group) => {
		const child = forkTask<EventMap>(group);
		const timer = setTimer(
			() =>
				child.ctx.abort(
					new DOMException(`Timed out after ${ms}ms`, "TimeoutError"),
				),
			ms,
		);

		try {
			return await raceAbort(
				Promise.resolve(traceRun(child.ctx, "run", () => run(child.ctx))),
				child.ctx,
			);
		} finally {
			clearTimer(timer);
			child.unlink();
		}
	});

/**
 * Runs a function; if it takes longer than `ms`, aborts its signal and rejects
 * with a `TimeoutError` (a `DOMException`, like `AbortSignal.timeout`), even if
 * it ignores the signal. If the caller aborts, rejects with its reason. Two
 * forms:
 *
 * - `timeout(ms, task)` wraps a Task `(payload, ctx) => result` and returns a
 *   Task. The Task gets a context of its own whose `signal` the time limit
 *   aborts: `bus.on("load", latest(timeout(5000, load)))`.
 * - `timeout(ctx, ms, starter)` is for one call inside a body; `starter` gets
 *   the context of its own child task, or `{ signal, abort }` when `ctx` is not a task context.
 *
 * @example
 * ```ts
 * bus.on("load", timeout(5000, (id, { signal }) => fetchData(id, { signal })));
 *
 * bus.on("load", async (id, ctx) => {
 *   const data = await timeout(ctx, 5000, ({ signal }) => fetchData(id, { signal }));
 * });
 * ```
 */
export function timeout<P, E extends EventMap, R>(
	ms: number,
	task: Task<P, E, R>,
): Startable<P, E, Promise<Awaited<R>>>;
export function timeout<C extends { signal?: AbortSignal }, T>(
	ctx: C,
	ms: number,
	starter: Starter<T, ChildOf<C>>,
): Promise<T>;
export function timeout(
	first: number | { signal?: AbortSignal },
	second: number | Task<unknown, EventMap, unknown>,
	third?: Starter<unknown, Context<EventMap>>,
): unknown {
	if (typeof first === "number") {
		const task = second as Task<unknown, EventMap, unknown>;

		const run = (ctx: Context<EventMap>, payload: unknown) =>
			timeoutBody(ctx, first, bodyOf(task, payload));

		return (payload: unknown, ctx?: Context<EventMap>) =>
			runTaskOrStarter(payload, ctx, run);
	}
	const ms = second as number;
	const starter = third as Starter<unknown, Context<EventMap>>;

	return timeoutBody(first, ms, starter);
}
