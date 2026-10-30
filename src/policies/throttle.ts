import type { Context } from "../core/bus";
import type { EventMap, Task } from "../core/types";
import { clearTimer, setTimer, type Timer } from "../utils";
import {
	formOf,
	type Keyed,
	type KeyOption,
	keyed,
	type Loose,
	noop,
	type Unkeyed,
} from "./keyed";
import { dropCall, startCall } from "./lifecycle";

type Pending<P, E extends EventMap, R> = {
	payload: P;
	ctx: Context<E>;
	resolve: (value?: R) => void;
	reject: (error: unknown) => void;
};

export type ThrottleOptions<P = never> = KeyOption<P> & {
	/** Run the first call at once, when the throttle is idle. Default `true`. */
	leading?: boolean;
	/** Run the latest call made while waiting, at the end of the window. Default `true`. */
	trailing?: boolean;
};

/** What `throttle(ms)` returns: it turns a task into a `throttle` task. */
export type ThrottleWrapper = <P, E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, R | Promise<R | undefined> | undefined>;

/** What `throttle(ms, { key })` returns: the payload type comes from `key`. */
export type KeyedThrottleWrapper<P> = <E extends EventMap, R>(
	fn: Task<P, E, R>,
) => Task<P, E, R | Promise<R | undefined> | undefined>;

/**
 * At most one run per `ms`, with the semantics of lodash `throttle` (and
 * patronum): a call made when the throttle is idle, that is, at least `ms`
 * after the previous call and the previous run, runs at once (`leading`); calls
 * made while it waits are held, and the latest of them runs when the window
 * closes (`trailing`). Under a steady stream of calls it runs every `ms`.
 *
 * A held call returns a promise that settles with its result; calls superseded
 * by a newer one, or not allowed to wait (`trailing: false`), resolve with
 * `undefined`. With `leading: false` even the first call waits for the end of
 * its window. With `options.key` each key has its own throttle.
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
export function throttle<P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
	options?: ThrottleOptions<P>,
): Task<P, E, R | Promise<R | undefined> | undefined>;
export function throttle(
	ms: number,
	options?: Unkeyed<ThrottleOptions>,
): ThrottleWrapper;
export function throttle<P>(
	ms: number,
	options: Keyed<ThrottleOptions<P>, P>,
): KeyedThrottleWrapper<P>;
export function throttle(ms: number, first?: Loose, second?: Loose): unknown {
	return formOf(first, second, (fn, options) => buildThrottle(ms, fn, options));
}

const buildThrottle = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
	options: ThrottleOptions<P>,
): Task<P, E, R | Promise<R | undefined> | undefined> => {
	const create = (onIdle: () => void) =>
		createThrottle(ms, fn, options, onIdle);

	return keyed(options.key, create);
};

// The algorithm of lodash `debounce` with `maxWait` equal to the wait, which is
// how lodash builds `throttle`. A window starts at the first call and ends when
// `ms` have passed since the last call or since the last run.
const createThrottle = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
	options: ThrottleOptions<P>,
	onIdle: () => void,
): Task<P, E, R | Promise<R | undefined> | undefined> => {
	const leading = options.leading ?? true;
	const trailing = options.trailing ?? true;
	const keyed = onIdle !== noop;
	let lastCallTime: number | null = null;
	let lastRunTime = 0;
	let timer: Timer | null = null;
	let cooldown: Timer | null = null;
	let pending: Pending<P, E, R> | null = null;
	// true while `fn` runs synchronously: a call made from inside it must wait
	let busy = false;

	const shouldRun = (time: number) =>
		lastCallTime === null ||
		time - lastCallTime >= ms ||
		time - lastCallTime < 0 ||
		time - lastRunTime >= ms;

	const drop = (ctx: Context<E>) => dropCall(ctx, "throttle");

	const dropPending = () => {
		const held = pending;
		pending = null;
		if (held) {
			drop(held.ctx);
			held.resolve();
		}
	};

	const hold = (payload: P, ctx: Context<E>) => {
		dropPending();
		return new Promise<R | undefined>((resolve, reject) => {
			pending = { payload, ctx, resolve, reject };
		});
	};

	const run = (payload: P, ctx: Context<E>, time: number) => {
		dropPending();
		lastRunTime = time;
		busy = true;

		try {
			return startCall(ctx, "throttle", () => fn(payload, ctx));
		} finally {
			busy = false;
		}
	};

	const armCooldown = () => {
		if (keyed) {
			cooldown = setTimer(checkIdle, ms);
		}
	};

	// a keyed throttle is forgotten once it behaves like a fresh one
	const checkIdle = () => {
		cooldown = null;
		if (!keyed || timer !== null || pending) {
			return;
		}

		const time = Date.now();
		const wait = Math.max(
			ms - (time - (lastCallTime ?? Number.NEGATIVE_INFINITY)),
			ms - (time - lastRunTime),
		);
		if (wait <= 0) {
			onIdle();
		} else {
			cooldown = setTimer(checkIdle, wait);
		}
	};

	const trailingEdge = (time: number) => {
		timer = null;
		const held = pending;

		if (trailing && held && !held.ctx.signal.aborted) {
			pending = null;
			try {
				held.resolve(run(held.payload, held.ctx, time));
			} catch (error) {
				held.reject(error);
			}
		} else {
			dropPending();
		}
		checkIdle();
	};

	const expired = () => {
		const time = Date.now();
		if (shouldRun(time)) {
			trailingEdge(time);
		} else {
			const last = lastCallTime ?? time;
			timer = setTimer(
				expired,
				Math.min(ms - (time - last), ms - (time - lastRunTime)),
			);
		}
	};

	const cancelCooldown = () => {
		if (cooldown !== null) {
			clearTimer(cooldown);
			cooldown = null;
		}
	};

	// a call that does not run now: it waits for the end of the window, or is dropped
	const defer = (payload: P, ctx: Context<E>) => {
		if (!trailing) {
			drop(ctx);
			return;
		}
		return hold(payload, ctx);
	};

	// Without a trailing run nothing is owed after the leading one, so no timer
	// is needed: the window is told from the times of the last call and run.
	const leadingOnly = (
		payload: P,
		ctx: Context<E>,
		time: number,
		running: boolean,
	) => {
		if (!running) {
			drop(ctx);
			return;
		}

		lastRunTime = time;
		armCooldown();
		if (!leading) {
			drop(ctx);
			return;
		}
		return run(payload, ctx, time);
	};

	// With a trailing run: a timer ends the window and runs the call held.
	const withTrailing = (
		payload: P,
		ctx: Context<E>,
		time: number,
		running: boolean,
	) => {
		if (running && timer !== null) {
			// the window is over but its timer has not fired: restart it, run now
			clearTimer(timer);
			timer = setTimer(expired, ms);
			return run(payload, ctx, time);
		}

		if (timer === null) {
			timer = setTimer(expired, ms);
			if (running) {
				// the throttle was idle: a new window starts
				lastRunTime = time;
				if (leading) {
					return run(payload, ctx, time);
				}
			}
		}

		return defer(payload, ctx);
	};

	return (payload, ctx) => {
		if (ctx.signal.aborted) {
			return;
		}

		const time = Date.now();
		// a call made by `fn` itself never runs at once, or it could loop forever
		const running = !busy && shouldRun(time);
		lastCallTime = time;
		cancelCooldown();

		return trailing
			? withTrailing(payload, ctx, time, running)
			: leadingOnly(payload, ctx, time, running);
	};
};
