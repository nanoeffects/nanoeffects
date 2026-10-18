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
	| "race";

export type Phase = "start" | "done" | "error" | "cancel" | "drop";

export type TraceEvent<E = Record<string, unknown>> = {
	[K in Keys<E>]: {
		id: number;
		parent?: number;
		type: K;
		effect: EffectName;
		phase: Phase;
		payload: E[K];
		error?: unknown;
	};
}[Keys<E>];

export type UnsubscribeCallback = () => void;
