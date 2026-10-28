import type { Context } from "../core/bus";
import { traceRun, traceTask } from "../core/context";
import {
	callLifecycle,
	type Lifecycle,
	reportsLifecycle,
} from "../core/lifecycle-key";
import type { EffectName, EventMap } from "../core/types";

// a job puts the lifecycle of a call on its context; a call outside a job has none
const lifecycleOf = (ctx: object): Lifecycle | undefined =>
	Reflect.get(ctx, callLifecycle);

/** Tells a job that the handler of this call starts. */
export const startCallOf = (ctx: object) => {
	lifecycleOf(ctx)?.start();
};

/** Tells a job that the handler of this call starts, then runs `fn` as `traceRun` does. */
export const startCall = <E extends EventMap, R>(
	ctx: Context<E>,
	effect: EffectName,
	fn: () => R,
): R => {
	startCallOf(ctx);

	return traceRun(ctx, effect, fn);
};

/** Tells a job that this call ended without starting, and traces it as dropped. */
export const dropCall = <E extends EventMap>(
	ctx: Context<E>,
	effect: EffectName,
) => {
	traceTask(ctx, effect, "drop");
	lifecycleOf(ctx)?.drop();
};

/** Tells a job how the handler of this call settled, before the policy starts the next one. */
export const doneCall = (
	ctx: object,
	settled: { value: unknown } | { error: unknown },
) => {
	lifecycleOf(ctx)?.done(settled);
};

/** Tells a job how a call that was aborted ended: cancelled if it started, dropped if not. */
export const endCall = (ctx: object, started: boolean, reason: unknown) => {
	const lifecycle = lifecycleOf(ctx);
	if (started) {
		lifecycle?.cancel(reason);
	} else {
		lifecycle?.drop();
	}
};

/** Tells a job that starts of this call are reported, not assumed at the call. */
export const reporting = <T extends object>(task: T): T => {
	Reflect.set(task, reportsLifecycle, true);

	return task;
};
