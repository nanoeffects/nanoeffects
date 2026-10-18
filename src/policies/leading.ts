import type { Task } from "../task";
import type { EventMap } from "../types";
import { after } from "../util";

/** Drops new calls while the task is still running. */
export const leading = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
): Task<P, E, R | Promise<Awaited<R>> | undefined> => {
	let running = false;

	return (payload, ctx) => {
		if (running) {
			return;
		}

		running = true;
		try {
			return after(fn(payload, ctx), () => {
				running = false;
			});
		} catch (error) {
			running = false;
			throw error;
		}
	};
};
