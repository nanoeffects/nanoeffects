import { traceRun, traceTask } from "../context";
import type { EventMap, Task } from "../types";
import { after } from "../utils";

/**
 * Drops new calls while the task is still running. The lock is released when
 * the run settles or when its task is aborted, whichever comes first, so a
 * `fn` that ignores the abort signal may overlap with the next run.
 *
 * @example
 * ```ts
 * bus.on(
 *   "save",
 *   leading(async (draft) => {
 *     await api.save(draft);
 *   }),
 * );
 *
 * bus.emit("save", draft); // runs
 * bus.emit("save", draft); // dropped while the first save is in flight
 * ```
 */
export const leading = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
): Task<P, E, R | Promise<Awaited<R>> | undefined> => {
	let lock: object | null = null;

	return (payload, ctx) => {
		if (ctx.signal.aborted) {
			return;
		}

		if (lock) {
			traceTask(ctx, "leading", "drop");
			return;
		}

		const mine = {};
		lock = mine;
		const release = () => {
			ctx.signal.removeEventListener("abort", release);
			if (lock === mine) {
				lock = null;
			}
		};
		ctx.signal.addEventListener("abort", release, { once: true });

		try {
			return after(
				traceRun(ctx, "leading", () => fn(payload, ctx)),
				release,
			);
		} catch (error) {
			release();
			throw error;
		}
	};
};
