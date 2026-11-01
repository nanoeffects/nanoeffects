import type { TraceLogger } from "../core/types";
import { safeSerialize } from "../graph/serialize";

/** The part of the User Timing API the logger uses. */
export type PerformanceLike = {
	now: () => number;
	mark: (name: string, options?: { detail?: unknown }) => unknown;
	measure: (
		name: string,
		options: { start: number; end: number; detail?: unknown },
	) => unknown;
};

export type PerformanceLoggerOptions = {
	/** Defaults to `globalThis.performance`. */
	performance?: PerformanceLike;
};

// String(error) throws for an object with no prototype or a throwing toString: an error is read as text safely
const textOf = (error: unknown) => {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}
	const plain = safeSerialize(error);

	return typeof plain === "string" ? plain : JSON.stringify(plain);
};

/**
 * Trace logger that records User Timing entries, so tasks show up on the
 * Timings track of the browser Performance panel. A task that started is a
 * measure from `start` to its end; a dropped call is a single mark.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>({ trace: createTracer(performanceLogger()) });
 * ```
 */
export const performanceLogger = (
	options: PerformanceLoggerOptions = {},
): TraceLogger => {
	const perf = options.performance ?? globalThis.performance;
	const startedAt = new Map<number, number>();

	return ({
		id,
		parentId,
		rootId,
		traceGroupId,
		type,
		effect,
		phase,
		error,
	}) => {
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
			parentId,
			...(rootId !== void 0 && { rootId }),
			...(traceGroupId !== void 0 && { traceGroupId }),
			phase,
			...(phase === "error" && { error: textOf(error) }),
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
