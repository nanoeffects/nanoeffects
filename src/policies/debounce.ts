import type { EventMap, Task } from "../types";
import { delay } from "../util";
import { latest } from "./latest";

/** Waits for `ms` of quiet, then runs; a new call restarts the wait and drops the previous. */
export const debounce = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
) =>
	latest<P, E, Promise<R>>((payload, ctx) =>
		delay(ms, ctx.signal).then(() => fn(payload, ctx)),
	);
