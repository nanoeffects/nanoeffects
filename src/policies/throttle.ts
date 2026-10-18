import type { Context } from "../bus";
import { traceRun, traceTask } from "../context";
import type { EventMap, Task } from "../types";
import { delay } from "../utils";

type Pending<P, E extends EventMap, R> = {
	payload: P;
	ctx: Context<E>;
	resolve: (value?: R) => void;
	reject: (error: unknown) => void;
};

/**
 * At most one run per `ms`; leading now, latest trailing after the window.
 * A trailing call returns a promise that settles with its result; calls
 * superseded by a newer one resolve with `undefined`.
 *
 * @example
 * ```ts
 * bus.on(
 *   "scroll",
 *   throttle(200, (position) => {
 *     saveScrollPosition(position);
 *   }),
 * );
 *
 * bus.emit("scroll", 10); // runs now
 * bus.emit("scroll", 20); // superseded
 * bus.emit("scroll", 30); // runs once the 200 ms window closes
 * ```
 */
export const throttle = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
): Task<P, E, R | Promise<R | undefined> | undefined> => {
	let open = true;
	let pending: Pending<P, E, R> | null = null;

	const run = (payload: P, ctx: Context<E>) => {
		open = false;
		delay(ms).then(() => {
			open = true;
			const next = pending;
			pending = null;

			if (!next) {
				return;
			}

			if (next.ctx.signal.aborted) {
				traceTask(next.ctx, "throttle", "drop");
				next.resolve();
				return;
			}

			try {
				next.resolve(run(next.payload, next.ctx) as R);
			} catch (error) {
				next.reject(error);
			}
		});
		return traceRun(ctx, "throttle", () => fn(payload, ctx));
	};

	return (payload, ctx) => {
		if (ctx.signal.aborted) {
			return;
		}

		if (open) {
			return run(payload, ctx);
		}

		if (pending) {
			traceTask(pending.ctx, "throttle", "drop");
			pending.resolve();
		}
		return new Promise<R | undefined>((resolve, reject) => {
			pending = { payload, ctx, resolve, reject };
		});
	};
};
