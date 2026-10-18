import { traceRun, traceTask } from "../core/context";
import type { EventMap, Task } from "../core/types";
import { after, onAbort } from "../utils";
import { byKey, type KeyOption, noop } from "./keyed";

export type LeadingOptions<P = never> = KeyOption<P>;

/**
 * Drops new calls while the task is still running. The lock is released when
 * the run settles or when its task is aborted, whichever comes first, so a
 * `fn` that ignores the abort signal may overlap with the next run. With
 * `options.key` each key has its own lock.
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
	options: LeadingOptions<P> = {},
): Task<P, E, R | Promise<Awaited<R>> | undefined> => {
	const create = (
		onIdle: () => void,
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
				stopWatching();
				if (lock === mine) {
					lock = null;
					onIdle();
				}
			};
			const stopWatching = onAbort(ctx, release);

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

	return options.key ? byKey(options.key, create) : create(noop);
};
