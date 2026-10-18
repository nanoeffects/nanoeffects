import type { TraceEvent, TraceLogger } from "../types";

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
 * const recorder = createRecorder<Events>();
 * const bus = createBus<Events>({ trace: recorder });
 *
 * bus.emit("search", "re");
 * bus.emit("search", "redux");
 * recorder.events.map((e) => e.phase); // ["start", "cancel", "start", "done"]
 * ```
 */
export const createRecorder = <E = Record<string, unknown>>(): Recorder<E> => {
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
