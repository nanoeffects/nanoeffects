import type { EventMap, Task } from "../types";
import { delay } from "../utils";
import { latest } from "./latest";

/**
 * Waits for `ms` of quiet, then runs; a new call restarts the wait and drops the previous.
 *
 * @example
 * ```ts
 * bus.on(
 *   "input",
 *   debounce(300, async (text, { signal }) => {
 *     const res = await fetch(`/api?q=${text}`, { signal });
 *     showResults(await res.json());
 *   }),
 * );
 *
 * bus.emit("input", "r");
 * bus.emit("input", "re"); // only the last call runs, 300 ms after it
 * ```
 */
export const debounce = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
) =>
	latest<P, E, Promise<R>>((payload, ctx) =>
		delay(ms, ctx).then(() => fn(payload, ctx)),
	);
