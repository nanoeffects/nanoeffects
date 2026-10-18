import type { Context } from "../bus";
import type { EventMap, Task } from "../types";
import { delay } from "../util";

/** At most one run per `ms`; leading now, latest trailing after the window. */
export const throttle = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
): Task<P, E, R | Promise<Awaited<R>> | undefined> => {
	let open = true;
	let trailing: { payload: P; ctx: Context<E> } | null = null;

	const run = (payload: P, ctx: Context<E>) => {
		open = false;
		delay(ms).then(() => {
			open = true;
			const next = trailing;
			trailing = null;

			if (next && !next.ctx.signal.aborted) {
				run(next.payload, next.ctx);
			}
		});
		return fn(payload, ctx);
	};

	return (payload, ctx) => {
		if (ctx.signal.aborted) {
			return;
		}

		if (!open) {
			trailing = { payload, ctx };
			return;
		}

		return run(payload, ctx);
	};
};
