import type { EventMap, Task } from "../core/types";
import { onAbort } from "../utils";
import {
	formOf,
	type Keyed,
	type KeyOption,
	keyed,
	type Loose,
	noop,
	type Unkeyed,
} from "./keyed";
import { doneCall, dropCall, startCall } from "./lifecycle";

export type QueueOptions<P = never> = KeyOption<P> & {
	/** How many calls may run at the same time. Default 1. */
	concurrency?: number;
	/** How many calls may wait for a free slot. Default: no limit. */
	limit?: number;
	/**
	 * What to drop when a call arrives and `limit` calls already wait: the new
	 * call (`"drop-new"`, the default) or the oldest waiting one (`"drop-old"`,
	 * which keeps the most recent calls). A dropped call resolves with `undefined`.
	 */
	overflow?: "drop-new" | "drop-old";
};

type Entry = { start: () => void; drop: () => void };

/** What `queue()` returns: it turns a task into a `queue` task. */
export type QueueWrapper = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, Promise<Awaited<R> | undefined>>;

/** What `queue({ key })` returns: the payload type comes from `key`. */
export type KeyedQueueWrapper<P> = <E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, Promise<Awaited<R> | undefined>>;

/**
 * Runs calls one after another, in the order they arrived: a call starts when
 * fewer than `concurrency` calls are running. Every call returns a promise with
 * the result of its own run; an error rejects only that call, and the queue
 * goes on. The first call on an idle queue starts synchronously.
 *
 * With `limit` the number of waiting calls is capped. `limit: 1` with
 * `overflow: "drop-old"` keeps only the latest call while one is running, and
 * runs it when the current one is done.
 *
 * With `options.key` each key has its own line.
 *
 * A call whose task aborts while it waits is skipped and resolves with
 * `undefined`. When the task of a running call aborts, its slot is freed at
 * once and its result is dropped; a `fn` that ignores the abort signal can
 * then overlap with the next run.
 *
 * @example
 * ```ts
 * bus.on(
 *   "save",
 *   queue(async (draft, { signal }) => {
 *     await api.save(draft, { signal });
 *   }),
 * );
 *
 * bus.emit("save", a); // runs
 * bus.emit("save", b); // waits for a, then runs
 * ```
 */
export function queue<P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options?: QueueOptions<P>,
): Task<P, E, Promise<Awaited<R> | undefined>>;
export function queue(options?: Unkeyed<QueueOptions>): QueueWrapper;
export function queue<P>(
	options: Keyed<QueueOptions<P>, P>,
): KeyedQueueWrapper<P>;
export function queue(first?: Loose, second?: Loose): unknown {
	return formOf(first, second, buildQueue);
}

const buildQueue = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options: QueueOptions<P>,
): Task<P, E, Promise<Awaited<R> | undefined>> => {
	const create = (onIdle: () => void) => createQueue(fn, options, onIdle);

	return keyed(options.key, create);
};

const createQueue = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
	options: QueueOptions<P>,
	onIdle: () => void,
): Task<P, E, Promise<Awaited<R> | undefined>> => {
	const concurrency = options.concurrency ?? 1;
	const limit = options.limit ?? Number.POSITIVE_INFINITY;
	const waiting: Entry[] = [];
	let running = 0;

	const pump = () => {
		while (running < concurrency) {
			const next = waiting.shift();
			if (!next) {
				return;
			}
			next.start();
		}
	};

	return (payload, ctx) =>
		new Promise<Awaited<R> | undefined>((resolve, reject) => {
			if (ctx.signal.aborted) {
				resolve(void 0);
				return;
			}

			let stopWaiting = noop;

			const drop = () => {
				stopWaiting();
				dropCall(ctx, "queue");
				resolve(void 0);
			};

			const start = () => {
				stopWaiting();
				if (ctx.signal.aborted) {
					drop();
					return;
				}
				running++;

				let held = true;
				const free = () => {
					if (held) {
						held = false;
						running--;
						pump();
						if (running === 0 && waiting.length === 0) {
							onIdle();
						}
					}
				};
				const stopFree = onAbort(ctx, () => {
					free();
					resolve(void 0);
				});

				let outcome: Promise<Awaited<R>>;
				try {
					outcome = Promise.resolve(
						startCall(ctx, "queue", () => fn(payload, ctx)),
					);
				} catch (error) {
					outcome = Promise.reject(error);
				}

				// free the slot before the caller is resolved, so a caller that awaits
				// this call finds the queue ready for the next one
				const finish = () => {
					stopFree();
					free();
				};

				outcome.then(
					(value) => {
						doneCall(ctx, { value });
						finish();
						resolve(ctx.signal.aborted ? void 0 : value);
					},
					(error: unknown) => {
						doneCall(ctx, { error });
						finish();
						if (ctx.signal.aborted) {
							resolve(void 0);
						} else {
							reject(error);
						}
					},
				);
			};

			if (running < concurrency) {
				start();
				return;
			}

			if (waiting.length >= limit) {
				if (options.overflow !== "drop-old" || limit <= 0) {
					drop();
					return;
				}
				waiting.shift()?.drop();
			}

			const entry: Entry = { start, drop };
			waiting.push(entry);
			stopWaiting = onAbort(ctx, () => {
				const index = waiting.indexOf(entry);
				if (index >= 0) {
					waiting.splice(index, 1);
				}
				drop();
			});
		});
};
