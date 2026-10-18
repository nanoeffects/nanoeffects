import type { Context } from "../bus";
import { traceRun, traceTask } from "../context";
import type { EventMap, Task } from "../types";
import { byKey, type KeyOption, noop } from "./keyed";

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
export const throttle = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
	options: ThrottleOptions<P> = {},
): Task<P, E, R | Promise<R | undefined> | undefined> => {
	const create = (onIdle: () => void) =>
		createThrottle(ms, fn, options, onIdle);

	return options.key ? byKey(options.key, create) : create(noop);
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
	const { leading = true, trailing = true } = options;
	const keyed = onIdle !== noop;
	let lastCallTime: number | null = null;
	let lastRunTime = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let cooldown: ReturnType<typeof setTimeout> | null = null;
	let pending: Pending<P, E, R> | null = null;

	const shouldRun = (time: number) =>
		lastCallTime === null ||
		time - lastCallTime >= ms ||
		time - lastCallTime < 0 ||
		time - lastRunTime >= ms;

	const drop = (ctx: Context<E>) => traceTask(ctx, "throttle", "drop");

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
		return traceRun(ctx, "throttle", () => fn(payload, ctx));
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
			cooldown = setTimeout(checkIdle, wait);
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
			timer = setTimeout(
				expired,
				Math.min(ms - (time - last), ms - (time - lastRunTime)),
			);
		}
	};

	return (payload, ctx) => {
		if (ctx.signal.aborted) {
			return;
		}

		const time = Date.now();
		const running = shouldRun(time);
		lastCallTime = time;
		if (cooldown !== null) {
			clearTimeout(cooldown);
			cooldown = null;
		}

		if (running && timer === null) {
			// leading edge: the throttle was idle, so a new window starts
			lastRunTime = time;
			timer = setTimeout(expired, ms);
			if (leading) {
				return run(payload, ctx, time);
			}
		} else if (running && timer !== null) {
			// the window is over but its timer has not fired: restart it, run now
			clearTimeout(timer);
			timer = setTimeout(expired, ms);
			return run(payload, ctx, time);
		} else if (timer === null) {
			timer = setTimeout(expired, ms);
		}

		if (!trailing) {
			drop(ctx);
			return;
		}
		return hold(payload, ctx);
	};
};
