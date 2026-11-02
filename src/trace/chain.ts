import type { EffectName, Phase, TraceEvent } from "../core/types";
import type { Recorder } from "./recorder";
import type { KnownTask } from "./task-index";

/** One task on the way from the root to the task you asked about. */
export type ChainStep = {
	id: number;
	type: string;
	/** Absent for a task that reported no event (a plain listener). */
	effect?: EffectName;
	/** The latest phase of the task; absent when it reported no event. */
	phase?: Phase;
	source?: string;
	traceGroupId?: string;
};

type ChainSource<E> =
	| readonly TraceEvent<E>[]
	| Pick<Recorder<E>, "events" | "tasks">;

const eventsOf = <E>(source: ChainSource<E>) =>
	"events" in source ? source.events : source;

const tasksOf = <E>(source: ChainSource<E>): ReadonlyMap<number, KnownTask> =>
	"tasks" in source ? source.tasks : new Map();

/**
 * The causal path of a task: the tasks that led to it, from the root, ending
 * with the task itself. Use it to answer "what started the task that failed".
 *
 * Give it a recorder to keep the listeners that report no event in the path;
 * a plain list of events (a snapshot, a file read back) shows only the tasks
 * that have events.
 *
 * A parent that is not known (pushed out by a `capacity`) ends the path:
 * it starts at the oldest task that is known. An unknown `id` gives `[]`.
 *
 * @example
 * ```ts
 * const failed = recorder.events.find((event) => event.phase === "error");
 * const path = chainOf(recorder, failed.id);
 * path.map((step) => step.type).join(" → "); // "queryChanged → searchLoaded"
 * ```
 */
export const chainOf = <E = Record<string, unknown>>(
	source: ChainSource<E>,
	id: number,
): ChainStep[] => {
	const latest = new Map<number, TraceEvent<E>>();
	for (const event of eventsOf(source)) {
		latest.set(event.id, event);
	}
	const known = tasksOf(source);

	const path: ChainStep[] = [];
	const seen = new Set<number>();
	let next: number | undefined = id;
	while (next !== void 0 && !seen.has(next)) {
		seen.add(next);
		const event = latest.get(next);
		const task = known.get(next);
		const step = stepOf(next, event, task);
		if (!step) {
			break;
		}
		path.push(step);
		next = event?.parentId ?? task?.parentId;
	}
	return path.reverse();
};

const stepOf = <E>(
	id: number,
	event: TraceEvent<E> | undefined,
	task: KnownTask | undefined,
): ChainStep | undefined => {
	// an event is the newer word on a task; the task fills what the event lacks
	const fromEvent: Partial<TraceEvent<E>> = event ?? {};
	const fromTask: Partial<KnownTask> = task ?? {};
	const type = fromEvent.type ?? fromTask.type;
	if (type === void 0) {
		return void 0;
	}
	const source = fromEvent.source ?? fromTask.source;
	const traceGroupId = fromEvent.traceGroupId ?? fromTask.traceGroupId;
	return {
		id,
		type,
		...(event ? { effect: event.effect, phase: event.phase } : {}),
		...(source === void 0 ? {} : { source }),
		...(traceGroupId === void 0 ? {} : { traceGroupId }),
	};
};
