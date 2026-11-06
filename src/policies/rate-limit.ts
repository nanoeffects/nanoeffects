import type { EventMap, Task } from "../core/types";
import { clearTimer, onAbort, setTimer, type Timer } from "../utils";
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

export type RateLimitOptions<P = never> = KeyOption<P> & {
	/**
	 * What to do with a call that arrives when the window is full: keep it
	 * until it can start (`"wait"`, the default) or drop it (`"drop"`; the call
	 * resolves with `undefined`).
	 */
	overflow?: "wait" | "drop";
};

type Entry = { start: () => void; drop: () => void };

/** What `rateLimit(limit, ms)` returns: it turns a task into a `rateLimit` task. */
export type RateLimitWrapper = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, Promise<Awaited<R> | undefined>>;

/** What `rateLimit(limit, ms, { key })` returns: the payload type comes from `key`. */
export type KeyedRateLimitWrapper<P> = <E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, Promise<Awaited<R> | undefined>>;

/**
 * At most `limit` runs start in any window of `ms` milliseconds (a sliding
 * window, counted back from each call), for an API with a quota. A call over
 * the limit waits and starts, in the order of the calls, when the oldest start
 * leaves the window; with `overflow: "drop"` it is dropped instead.
 *
 * It limits starts, not how many runs go at the same time: put `queue` around
 * it for that. Every call returns a promise with the result of its own run;
 * the task of a call that aborts while it waits leaves the line, and aborting
 * a run that started does not give its place in the window back. With
 * `options.key` each key has its own window; the state of a key is dropped
 * once its window is empty. A `limit` below 1 is 1; `ms` follows `setTimer`.
 *
 * @example
 * ```ts
 * bus.on(
 *   "geocode",
 *   rateLimit(5, 1000, async (address, { signal }) => {
 *     return api.geocode(address, { signal });
 *   }),
 * );
 *
 * // the first five calls in a second run at once, the rest wait for the window
 * ```
 */
export function rateLimit<P, E extends EventMap, R>(
	limit: number,
	ms: number,
	fn: Task<P, E, R>,
	options?: RateLimitOptions<P>,
): Task<P, E, Promise<Awaited<R> | undefined>>;
export function rateLimit(
	limit: number,
	ms: number,
	options?: Unkeyed<RateLimitOptions>,
): RateLimitWrapper;
export function rateLimit<P>(
	limit: number,
	ms: number,
	options: Keyed<RateLimitOptions<P>, P>,
): KeyedRateLimitWrapper<P>;
export function rateLimit(
	limit: number,
	ms: number,
	first?: Loose,
	second?: Loose,
): unknown {
	return formOf(first, second, (fn, options) =>
		buildRateLimit(limit, ms, fn, options),
	);
}

const buildRateLimit = <P, E extends EventMap, R>(
	limit: number,
	ms: number,
	fn: Task<P, E, R>,
	options: RateLimitOptions<P>,
): Task<P, E, Promise<Awaited<R> | undefined>> => {
	// `>=` is false for NaN, so it falls back to 1 too
	const size = limit >= 1 ? Math.floor(limit) : 1;
	const create = (onIdle: () => void) =>
		createWindow(size, ms, options.overflow === "drop", fn, onIdle);

	return keyed(options.key, create);
};

const createWindow = <P, E extends EventMap, R>(
	size: number,
	ms: number,
	dropOverflow: boolean,
	fn: Task<P, E, R>,
	onIdle: () => void,
): Task<P, E, Promise<Awaited<R> | undefined>> => {
	// when each run in the window started, oldest first
	const starts: number[] = [];
	const waiting: Entry[] = [];
	let timer: Timer | null = null;

	const prune = () => {
		const now = Date.now();
		while (starts.length > 0 && (starts[0] ?? 0) + ms <= now) {
			starts.shift();
		}
	};

	// one timer, for the moment the oldest start leaves the window
	const schedule = () => {
		if (timer) {
			clearTimer(timer);
			timer = null;
		}
		const [oldest] = starts;
		if (oldest === void 0) {
			if (waiting.length === 0) {
				onIdle();
			}
			return;
		}
		timer = setTimer(pump, oldest + ms - Date.now());
	};

	function pump() {
		timer = null;
		prune();
		while (waiting.length > 0 && starts.length < size) {
			waiting.shift()?.start();
		}
		schedule();
	}

	return (payload, ctx) =>
		new Promise<Awaited<R> | undefined>((resolve, reject) => {
			if (ctx.signal.aborted) {
				resolve(void 0);
				return;
			}

			let stopWaiting = noop;

			const drop = () => {
				stopWaiting();
				dropCall(ctx, "rateLimit");
				resolve(void 0);
			};

			const start = () => {
				stopWaiting();
				if (ctx.signal.aborted) {
					drop();
					return;
				}
				starts.push(Date.now());

				const stopWatching = onAbort(ctx, () => resolve(void 0));
				let outcome: Promise<Awaited<R>>;
				try {
					outcome = Promise.resolve(
						startCall(ctx, "rateLimit", () => fn(payload, ctx)),
					);
				} catch (error) {
					outcome = Promise.reject(error);
				}
				outcome.then(
					(value) => {
						stopWatching();
						doneCall(ctx, { value });
						resolve(ctx.signal.aborted ? void 0 : value);
					},
					(error: unknown) => {
						stopWatching();
						doneCall(ctx, { error });
						if (ctx.signal.aborted) {
							resolve(void 0);
						} else {
							reject(error);
						}
					},
				);
			};

			prune();
			if (waiting.length === 0 && starts.length < size) {
				start();
				schedule();
				return;
			}

			if (dropOverflow) {
				drop();
				return;
			}

			const entry: Entry = { start, drop };
			waiting.push(entry);
			stopWaiting = onAbort(ctx, () => {
				const index = waiting.indexOf(entry);
				if (index >= 0) {
					waiting.splice(index, 1);
				}
				drop();
				if (waiting.length === 0 && starts.length === 0) {
					schedule();
				}
			});
			schedule();
		});
};
