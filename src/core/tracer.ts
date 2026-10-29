import type { EffectName, Phase } from "./types";

/** Opaque handle of one traced task. */
export type TaskRef = object;

/**
 * What the bus needs from tracing. The implementation, `createTracer` in
 * `nanoeffects/trace`, holds all the machinery (ids, events, loggers), so a
 * bus without `trace` carries none of it. `Ref` is an opaque handle that
 * `task` makes for each task.
 */
export interface Tracer<Ref extends object = object> {
	/**
	 * Registers a task and returns its handle; `parent` is the handle of its parent task.
	 * `traceGroupId` names the flow the task belongs to; a task without one has its parent’s.
	 */
	task(
		event: { type: string; payload?: unknown; traceGroupId?: string },
		parent?: Ref,
	): Ref;
	/** Gives the task another `type`, for a task that is named after it was made (a named listener). A tracer may leave it out. */
	rename?(ref: Ref, type: string): void;
	/** Reports a phase of a task. */
	report(ref: Ref, effect: EffectName, phase: Phase, error?: unknown): void;
	/** Returns `settle(phase, error?)` that reports only the first phase it gets. */
	settler(
		ref: Ref,
		effect: EffectName,
	): (phase: Phase, error?: unknown) => void;
	/**
	 * Runs `fn`, reporting `start` and then `done` / `error` of its (sync or
	 * async) result, or `cancel` if `signal` aborts first.
	 */
	run<R>(ref: Ref, effect: EffectName, signal: AbortSignal, fn: () => R): R;
}
