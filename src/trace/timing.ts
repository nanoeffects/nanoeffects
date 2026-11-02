import type { EffectName, Phase, TraceEvent, TraceLogger } from "../core/types";

/** One task of the trace with the time it took, or the time since it started. */
export type TimedTask = {
	id: number;
	type: string;
	effect: EffectName;
	parentId?: number;
	rootId?: number;
	source?: string;
	/** Milliseconds from `start` to the closing phase, or to now for an open task. */
	ms: number;
};

/** A task that closed: how it ended and how long it took. */
export type ClosedTask = TimedTask & { phase: Exclude<Phase, "start"> };

export type TimingLoggerOptions = {
	/** The clock, in ms. Default `performance.now`, or `Date.now` where there is none. */
	now?: () => number;
	/** Keep only the last N closed tasks in `durations`. `pending()` is never cut. Not a positive integer, or left out: keep all. */
	capacity?: number;
};

export type TimingLogger = TraceLogger & {
	/** The tasks that closed, oldest closed first. One live array. */
	readonly durations: ClosedTask[];
	/** The tasks that started and have not closed, oldest started first, with the time since `start`. */
	pending: () => TimedTask[];
	clear: () => void;
};

type Open = Omit<TimedTask, "ms"> & { startedAt: number };

const defaultNow = () =>
	typeof globalThis.performance?.now === "function"
		? globalThis.performance.now()
		: Date.now();

const identityOf = (event: TraceEvent): Omit<TimedTask, "ms"> => ({
	id: event.id,
	type: event.type,
	effect: event.effect,
	...(event.parentId === void 0 ? {} : { parentId: event.parentId }),
	...(event.rootId === void 0 ? {} : { rootId: event.rootId }),
	...(event.source === void 0 ? {} : { source: event.source }),
});

/**
 * Trace logger that measures time. It stamps each event when it gets it,
 * pairs `start` with the first `done`, `error`, `cancel` or `drop` of the same
 * task and effect, and keeps the result. Use it to find a slow handler, to see
 * how long a request lived before `cancel`, or to check that a test left
 * no task open.
 *
 * The logger sees what the tracer lets through: a task whose `start` was
 * filtered or not sampled never pairs, and its closing event is ignored.
 *
 * @example
 * ```ts
 * const timing = timingLogger();
 * const bus = createBus<Events>({ trace: createTracer(timing) });
 *
 * bus.emit("search", "redux");
 * timing.pending(); // [{ id: 1, type: "search", effect: "latest", ms: 0 }]
 * timing.durations; // after it ends: [{ ..., phase: "done", ms: 120 }]
 * ```
 */
export const timingLogger = (
	options: TimingLoggerOptions = {},
): TimingLogger => {
	const now = options.now ?? defaultNow;
	const capacity = options.capacity ?? 0;
	const limit = Number.isInteger(capacity) && capacity > 0 ? capacity : 0;
	const open = new Map<string, Open>();
	const durations: ClosedTask[] = [];

	const log = (event: TraceEvent) => {
		const key = `${event.id}:${event.effect}`;
		const time = now();

		if (event.phase === "start") {
			open.set(key, { ...identityOf(event), startedAt: time });
			return;
		}

		const started = open.get(key);
		if (!started) {
			return;
		}
		open.delete(key);

		const { startedAt, ...identity } = started;
		durations.push({ ...identity, phase: event.phase, ms: time - startedAt });
		if (limit > 0 && durations.length > limit) {
			durations.shift();
		}
	};

	const pending = () => {
		const time = now();
		return [...open.values()].map(({ startedAt, ...identity }) => ({
			...identity,
			ms: time - startedAt,
		}));
	};

	const clear = () => {
		open.clear();
		durations.length = 0;
	};

	return Object.assign(log, { durations, pending, clear });
};
