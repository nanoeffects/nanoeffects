import { traceRun, traceTask } from "../context";
import type { EventMap, Task } from "../types";
import { after } from "../utils";

/**
 * Drops new calls while the task is still running.
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
	let running = false;

	return (payload, ctx) => {
		if (running) {
			traceTask(ctx, "leading", "drop");
			return;
		}

		running = true;
		try {
			return after(
				traceRun(ctx, "leading", () => fn(payload, ctx)),
				() => {
					running = false;
				},
			);
		} catch (error) {
			running = false;
			throw error;
		}
	};
};
