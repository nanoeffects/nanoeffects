import type { TraceEvent, TraceLogger } from "../core/types";

export type Recorder<E = Record<string, unknown>> = TraceLogger<E> & {
	/** Every event received so far, in order. */
	readonly events: TraceEvent<E>[];
	clear: () => void;
};

/**
 * Trace logger that keeps events in memory; meant for tests.
 *
 * @example
 * ```ts
 * const recorder = createTraceRecorder<Events>();
 * const bus = createBus<Events>({ trace: createTracer(recorder) });
 *
 * bus.emit("search", "re");
 * bus.emit("search", "redux");
 * recorder.events.map((e) => e.phase); // ["start", "cancel", "start", "done"]
 * ```
 */
export const createTraceRecorder = <
	E = Record<string, unknown>,
>(): Recorder<E> => {
	const events: TraceEvent<E>[] = [];

	return Object.assign(
		(event: TraceEvent<E>) => {
			events.push(event);
		},
		{
			events,
			clear: () => {
				events.length = 0;
			},
		},
	);
};
