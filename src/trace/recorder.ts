import type { TraceEvent, TraceLogger } from "../core/types";
import { type JsonValue, safeSerialize } from "../graph/serialize";
import { createTaskIndex, type KnownTask } from "./task-index";

export type Recorder<E = Record<string, unknown>> = TraceLogger<E> & {
	/**
	 * The events received so far, oldest first. Without a `capacity` it is one
	 * live array; with one, each read is a new array that is a snapshot.
	 */
	readonly events: TraceEvent<E>[];
	/**
	 * The tasks the tracer told about, by `id`, also the ones that report no event (a plain
	 * listener). `chainOf` reads them to keep a path whole. Cut by `capacity` like `events`.
	 */
	readonly tasks: ReadonlyMap<number, KnownTask>;
	clear: () => void;
	/**
	 * The events as plain data that `JSON.stringify` takes: the payload and the error are made safe, so a
	 * circular object, an `Error`, a `Map` or a class instance cannot break it. `JSON.stringify(recorder)` uses it.
	 */
	toJSON: () => JsonValue[];
};

/**
 * Trace logger that keeps events in memory. With no option it keeps all of
 * them, for tests. With `capacity` it keeps the last events, to send when
 * something goes wrong.
 *
 * `payload` and `error` are kept as they are, and can hold private data: cut
 * what you send. An event has no time, and a `parentId` can name an event that
 * was pushed out: read it as a root.
 *
 * @example
 * ```ts
 * const recorder = createTraceRecorder<Events>();
 * const bus = createBus<Events>({ trace: createTracer(recorder) });
 *
 * bus.emit("search", "re");
 * bus.emit("search", "redux");
 * recorder.events.map((e) => e.phase); // ["start", "cancel", "start", "done"]
 *
 * const lastEvents = createTraceRecorder<Events>({ capacity: 500 });
 * ```
 */
export const createTraceRecorder = <E = Record<string, unknown>>(
	/** `capacity`: keep the last N events (a ring buffer); not a positive integer, or left out: keep all. */
	options?: { capacity?: number },
): Recorder<E> => {
	const capacity = options?.capacity ?? 0;
	const limit = Number.isInteger(capacity) && capacity > 0 ? capacity : 0;
	const buffer: TraceEvent<E>[] = [];
	const index = createTaskIndex(limit);
	let written = 0;

	const record = (event: TraceEvent<E>) => {
		if (limit === 0) {
			buffer.push(event);
			return;
		}
		buffer[written % limit] = event;
		written += 1;
	};

	const clear = () => {
		buffer.length = 0;
		written = 0;
		index.clear();
	};

	const snapshot = () => {
		const size = Math.min(written, limit);
		const first = written > limit ? written % limit : 0;
		const events: TraceEvent<E>[] = [];
		for (let index = 0; index < size; index += 1) {
			const event = buffer[(first + index) % limit];
			if (event) {
				events.push(event);
			}
		}
		return events;
	};

	const toJSON = () => {
		const events = limit > 0 ? snapshot() : buffer;

		return events.map((event) => safeSerialize(event));
	};

	const recorder = Object.assign(record, {
		clear,
		events: buffer,
		tasks: index.tasks,
		task: index.task,
		toJSON,
	});
	if (limit > 0) {
		Object.defineProperty(recorder, "events", { get: snapshot });
	}
	return recorder;
};
