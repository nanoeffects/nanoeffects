import type { TraceLogger } from "../types";

export type PerformanceLoggerOptions = {
	/** Defaults to `globalThis.performance`. */
	performance?: Pick<Performance, "now" | "mark" | "measure">;
};

/**
 * Trace logger that records User Timing entries, so tasks show up on the
 * Timings track of the browser Performance panel. A task that started is a
 * measure from `start` to its end; a dropped call is a single mark.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>({ trace: performanceLogger() });
 * ```
 */
export const performanceLogger = (
	options: PerformanceLoggerOptions = {},
): TraceLogger => {
	const perf = options.performance ?? globalThis.performance;
	const startedAt = new Map<number, number>();

	return ({ id, parent, type, effect, phase, error }) => {
		if (!perf) {
			return;
		}

		if (phase === "start") {
			startedAt.set(id, perf.now());
			return;
		}

		const name = `${type} · ${effect} (${phase})`;
		const detail = {
			id,
			parent,
			phase,
			...(phase === "error" && { error: String(error) }),
		};
		const start = startedAt.get(id);
		startedAt.delete(id);

		if (typeof start === "number") {
			perf.measure(name, { start, end: perf.now(), detail });
		} else {
			perf.mark(name, { detail });
		}
	};
};
