import { forkTask, traceRun } from "../core/context";
import type { EventMap } from "../core/types";
import { clearTimer, raceAbort, setTimer } from "../utils";
import { withGroup } from "./group";
import type { Starter } from "./run";

/**
 * Runs `starter`; if it takes longer than `ms`, aborts its signal and rejects
 * with a `TimeoutError` (a `DOMException`, like `AbortSignal.timeout`), even
 * if the starter ignores the signal. If `ctx` aborts, rejects with its reason.
 *
 * @example
 * ```ts
 * bus.on("load", async (id, ctx) => {
 *   const data = await timeout(ctx, 5000, ({ signal }) => fetchData(id, { signal }));
 * });
 * ```
 */
export const timeout = <T>(
	ctx: { signal?: AbortSignal },
	ms: number,
	starter: Starter<T>,
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
				Promise.resolve(
					traceRun(child.ctx, "run", () =>
						starter({ signal: child.ctx.signal, abort: child.ctx.abort }),
					),
				),
				child.ctx,
			);
		} finally {
			clearTimer(timer);
			child.unlink();
		}
	});
