import { traceRun, traceTask } from "../core/context";
import type { EventMap, Task } from "../core/types";
import { clearTimer, delay, onAbort, setTimer, type Timer } from "../utils";
import { type KeyOption, keyed, noop } from "./keyed";
import { latestWith } from "./latest";

type DebounceResult<R> =
	| Promise<R | undefined>
	| Promise<Awaited<R> | undefined>
	| undefined;

export type DebounceOptions<P = never> = KeyOption<P> & {
	/** Run the first call of a burst at once. Default `false`. */
	leading?: boolean;
	/** Run the last call of a burst after `ms` of quiet. Default `true`. */
	trailing?: boolean;
};

/**
 * Waits for `ms` of quiet, then runs; a new call restarts the wait and drops
 * the previous. With `leading` the first call of a burst runs at once, and the
 * trailing run happens only if more calls follow it. With `trailing: false`
 * only the leading call runs. With `options.key` each key has its own wait.
 *
 * @example
 * ```ts
 * bus.on(
 *   "input",
 *   debounce(300, async (text, { signal }) => {
 *     const res = await fetch(`/api?q=${text}`, { signal });
 *     showResults(await res.json());
 *   }),
 * );
 *
 * bus.emit("input", "r");
 * bus.emit("input", "re"); // only the last call runs, 300 ms after it
 * ```
 */
export const debounce = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
	options: DebounceOptions<P> = {},
): Task<P, E, DebounceResult<R>> => {
	const create = (onIdle: () => void) =>
		createDebounce(ms, fn, options, onIdle);

	return keyed(options.key, create);
};

// Without a trailing run there is nothing to wait for, so no timer is needed:
// a burst lasts while the calls come less than `ms` apart, told by their times.
const createLeadingOnly = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
	leading: boolean,
	onIdle: () => void,
): Task<P, E, DebounceResult<R>> => {
	const keyed = onIdle !== noop;
	let lastCall: number | null = null;
	let cooldown: Timer | null = null;

	return (payload, ctx) => {
		if (ctx.signal.aborted) {
			return;
		}

		const time = Date.now();
		const quiet =
			lastCall === null || time - lastCall >= ms || time - lastCall < 0;
		lastCall = time;

		if (cooldown !== null) {
			clearTimer(cooldown);
		}
		// a keyed debounce is forgotten after `ms` of quiet
		cooldown = keyed ? setTimer(onIdle, ms) : null;

		if (!(leading && quiet)) {
			traceTask(ctx, "debounce", "drop");
			return Promise.resolve(void 0);
		}
		return Promise.resolve(traceRun(ctx, "debounce", () => fn(payload, ctx)));
	};
};

const createDebounce = <P, E extends EventMap, R>(
	ms: number,
	fn: Task<P, E, R>,
	options: DebounceOptions<P>,
	onIdle: () => void,
): Task<P, E, DebounceResult<R>> => {
	const leading = options.leading ?? false;
	const trailing = options.trailing ?? true;
	if (!trailing) {
		return createLeadingOnly(ms, fn, leading, onIdle);
	}

	let inBurst = false;
	let generation = 0;

	// one wait per call; `ran` marks the leading call, which already ran
	const wait = latestWith<[P, boolean], E, Promise<R | undefined>>(
		"debounce",
		([payload, ran], ctx, begin) => {
			const mine = generation;
			onAbort(ctx, () => {
				if (generation === mine) {
					inBurst = false;
				}
			});

			return delay(ctx, ms).then(() => {
				inBurst = false;
				if (trailing && !ran) {
					begin();
					return fn(payload, ctx);
				}
			});
		},
		onIdle,
	);

	return (payload, ctx) => {
		if (ctx.signal.aborted) {
			return;
		}

		const first = leading && !inBurst;
		inBurst = true;
		generation++;
		const waiting = wait([payload, first], ctx);

		return first
			? Promise.resolve(traceRun(ctx, "debounce", () => fn(payload, ctx)))
			: waiting;
	};
};
