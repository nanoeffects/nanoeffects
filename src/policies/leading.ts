import type { EventMap, Task } from "../core/types";
import { after, onAbort } from "../utils";
import {
	formOf,
	type Keyed,
	type KeyOption,
	keyed,
	type Loose,
	type Unkeyed,
} from "./keyed";
import { dropCall, startCall } from "./lifecycle";

export type LeadingOptions<P = never> = KeyOption<P>;

/** What `leading()` returns: it turns a task into a `leading` task. */
export type LeadingWrapper = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, R | Promise<Awaited<R>> | undefined>;

/** What `leading({ key })` returns: the payload type comes from `key`. */
export type KeyedLeadingWrapper<P> = <E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, R | Promise<Awaited<R>> | undefined>;

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
export function leading<P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options?: LeadingOptions<P>,
): Task<P, E, R | Promise<Awaited<R>> | undefined>;
export function leading(options?: Unkeyed<LeadingOptions>): LeadingWrapper;
export function leading<P>(
	options: Keyed<LeadingOptions<P>, P>,
): KeyedLeadingWrapper<P>;
export function leading(first?: Loose, second?: Loose): unknown {
	return formOf(first, second, buildLeading);
}

const buildLeading = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options: LeadingOptions<P>,
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
				dropCall(ctx, "leading");
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
					startCall(ctx, "leading", () => fn(payload, ctx)),
					release,
				);
			} catch (error) {
				release();
				throw error;
			}
		};
	};

	return keyed(options.key, create);
};
