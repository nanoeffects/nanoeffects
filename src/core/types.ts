import type { Context } from "./bus";

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
	| "command";

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
export type TraceLogger<E = Record<string, unknown>> = (
	event: TraceEvent<E>,
) => void;

/** One logger or several; a throwing logger never breaks the task or the others. */
export type Trace<E = Record<string, unknown>> =
	| TraceLogger<E>
	| readonly TraceLogger<E>[];

export type UnsubscribeCallback = () => void;
