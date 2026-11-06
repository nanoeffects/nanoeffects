import type { EventMap, Task } from "../core/types";
import { isPromise, onAbort } from "../utils";
import {
	formOf,
	type Keyed,
	type KeyOption,
	keyed,
	type Loose,
	type Unkeyed,
} from "./keyed";
import { dropCall, startCall } from "./lifecycle";

export type DistinctOptions<P = never> = KeyOption<P> & {
	/** Tells whether two payloads are the same one. Default: `Object.is`. */
	equals?: (previous: P, next: P) => boolean;
};

/** What `distinct()` returns: it turns a task into a `distinct` task. */
export type DistinctWrapper = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, R | Promise<Awaited<R>> | undefined>;

/** What `distinct({ key })` returns: the payload type comes from `key`. */
export type KeyedDistinctWrapper<P> = <E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, R | Promise<Awaited<R>> | undefined>;

/**
 * Skips a call whose payload equals the payload of the last call that was
 * let through (`Object.is`, or `options.equals`). A skipped call does not run
 * the handler and returns `undefined`. The first call is always let through.
 *
 * Only the last payload is kept, never a result. A payload is remembered from
 * the moment its run starts, so the same payload that comes while it runs is
 * skipped; it is forgotten when the run fails or its task aborts, so a retry
 * runs. With `options.key` each key remembers its own payload. That memory is
 * the point of the policy, so it is not dropped when a key is idle: take keys
 * from a bounded set.
 *
 * @example
 * ```ts
 * bus.on(
 *   "draft/save",
 *   distinct(async (draft) => {
 *     await api.save(draft);
 *   }),
 * );
 *
 * bus.emit("draft/save", "text"); // runs
 * bus.emit("draft/save", "text"); // skipped, the same text
 * ```
 */
export function distinct<P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options?: DistinctOptions<P>,
): Task<P, E, R | Promise<Awaited<R>> | undefined>;
export function distinct(options?: Unkeyed<DistinctOptions>): DistinctWrapper;
export function distinct<P>(
	options: Keyed<DistinctOptions<P>, P>,
): KeyedDistinctWrapper<P>;
export function distinct(first?: Loose, second?: Loose): unknown {
	return formOf(first, second, buildDistinct);
}

type Remembered<P> = { payload: P } | null;

const buildDistinct = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options: DistinctOptions<P>,
): Task<P, E, R | Promise<Awaited<R>> | undefined> => {
	const equals = options.equals ?? Object.is;

	// the memory outlives a run, so an instance never reports that it is idle
	const create = (): Task<P, E, R | Promise<Awaited<R>> | undefined> => {
		let last: Remembered<P> = null;

		return (payload, ctx) => {
			if (ctx.signal.aborted) {
				return;
			}
			if (last && equals(last.payload, payload)) {
				dropCall(ctx, "distinct");
				return;
			}

			const mine: Remembered<P> = { payload };
			last = mine;
			const forget = () => {
				if (last === mine) {
					last = null;
				}
			};
			const stopWatching = onAbort(ctx, forget);

			try {
				const result = startCall(ctx, "distinct", () => fn(payload, ctx));
				if (!isPromise(result)) {
					stopWatching();
					return result;
				}

				return Promise.resolve(result).then(
					(value) => {
						stopWatching();
						return value;
					},
					(error: unknown) => {
						stopWatching();
						forget();
						throw error;
					},
				);
			} catch (error) {
				stopWatching();
				forget();
				throw error;
			}
		};
	};

	return keyed(options.key, create);
};
