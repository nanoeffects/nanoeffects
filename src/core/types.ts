import type { Context } from "./bus";

/** The third argument of `on` and `once`: each field is read by the plugin that names it, ignored without it. */
export type ListenerOptions = {
	/** Names the listener in the trace: each call of it is a task with this `type`. Read by `tracePlugin`. */
	traceId?: string;
	/** Removes the listener when this aborts, and adds none if it aborted already. Read by `signalPlugin`. */
	signal?: AbortSignal;
};

export type PayloadOf<P> = undefined extends P ? [payload?: P] : [payload: P];

export type EventMap = Record<string, unknown>;
export type Keys<E> = keyof E & string;

export type Task<P, E extends EventMap, R = unknown> = (
	payload: P,
	ctx: Context<E>,
) => R;

export type EffectName =
	| "every"
	| "latest"
	| "leading"
	| "debounce"
	| "throttle"
	| "run"
	| "all"
	| "race"
	| "retry"
	| "timeout"
	| "poll"
	| "take"
	| "queue"
	| "allSettled"
	| "action"
	| "emit";

export type Phase = "start" | "done" | "error" | "cancel" | "drop";

export type TraceEvent<E = Record<string, unknown>> = {
	[K in Keys<E>]: {
		id: number;
		/** Id of the task that started this one, if it has one. */
		parentId?: number;
		type: K;
		effect: EffectName;
		phase: Phase;
		payload: E[K];
		error?: unknown;
		/** The flow the task belongs to: its own, or the nearest ancestor’s; absent without one. */
		traceGroupId?: string;
		/** The id of the root task of the chain; absent on the root itself. */
		rootId?: number;
	};
}[Keys<E>];

/**
 * The contract of every trace logger: receives each task phase of a bus.
 * Adapters in `nanoeffects/trace` are factories that return one; pass it
 * through `createTracer` to `createBus({ trace })`.
 */
export type TraceLogger<E = Record<string, unknown>> = ((
	event: TraceEvent<E>,
) => void) & {
	/**
	 * Optional: called when a task is made (and again when it is renamed), also for the tasks that
	 * never report an event, like a plain handler. Not called for a root that is not sampled.
	 */
	task?: (task: TaskInfo) => void;
};

/** What a logger's `task` method gets about one task. */
export type TaskInfo = {
	/** Opaque handle of the task; the same one in the call for a rename. Key a `WeakMap` with it. */
	ref: object;
	/** Handle of the parent task; absent for a root. */
	parent?: object;
	/** The number the events of the task use as `id`. */
	id: number;
	/** The type of the task now: the event, or the name of a listener after a rename. */
	type: string;
	/** After a rename, the type the task had before it (the event the listener handles). */
	event?: string;
	/** `true` for the emit event that `tracePlugin` makes, which has no handler of its own. */
	leaf?: boolean;
	traceGroupId?: string;
};

/** One logger or several; a throwing logger never breaks the task or the others. */
export type Trace<E = Record<string, unknown>> =
	| TraceLogger<E>
	| readonly TraceLogger<E>[];

export type UnsubscribeCallback = () => void;
