import type { Context, Emit, Off, On } from "./bus";
import type { TaskRef, Tracer } from "./tracer";
import type { EffectName, EventMap, PayloadOf, Phase, Task } from "./types";
import { linkedController, onAbort } from "./utils";

type Event = { type: string; payload?: unknown };

type TaskMeta = { tracer: Tracer; ref: TaskRef };

const metaOf = new WeakMap<object, TaskMeta>();
const noop = () => {};

/** Reports a phase of `ctx` to the bus tracer; no-op without one. */
export const traceTask = <E extends EventMap>(
	ctx: Context<E>,
	effect: EffectName,
	phase: Phase,
	error?: unknown,
) => {
	const meta = metaOf.get(ctx);
	meta?.tracer.report(meta.ref, effect, phase, error);
};

/** Returns `settle(phase, error?)` that reports only the first phase of `ctx`. */
export const createSettle = <E extends EventMap>(
	ctx: Context<E>,
	effect: EffectName,
): ((phase: Phase, error?: unknown) => void) => {
	const meta = metaOf.get(ctx);

	return meta ? meta.tracer.settler(meta.ref, effect) : noop;
};

/**
 * Runs `fn`, reporting `start` and then `done` / `error` of its (sync or async)
 * result, or `cancel` if `ctx` is aborted first. Just runs `fn` without a tracer.
 */
export const traceRun = <E extends EventMap, R>(
	ctx: Context<E>,
	effect: EffectName,
	fn: () => R,
): R => {
	const meta = metaOf.get(ctx);

	return meta ? meta.tracer.run(meta.ref, effect, ctx.signal, fn) : fn();
};

/** The parts of the bus a task context forwards to; all absent for a plain `{ signal }` parent. */
type TaskBus<E extends EventMap> = {
	emit?: Emit<E> | undefined;
	on?: On<E> | undefined;
	off?: Off<E> | undefined;
};

/**
 * Creates the context of one task. Its signal follows `parent`; `unlink`
 * detaches it from `parent` once the task is finished.
 */
export const createTask = <E extends EventMap>(
	event: Event,
	bus: TaskBus<E> | undefined,
	tracer: Tracer | undefined,
	parent?: { signal?: AbortSignal | undefined; ref?: TaskRef | undefined },
) => {
	const { controller, unlink } = linkedController(parent?.signal);
	const { signal } = controller;

	const meta = tracer && { tracer, ref: tracer.task(event, parent?.ref) };

	const taskEmit = (...args: unknown[]) => {
		if (signal.aborted) {
			return;
		}
		return (bus?.emit as ((...a: unknown[]) => unknown) | undefined)?.(...args);
	};

	const taskOn = (...args: unknown[]) => {
		if (signal.aborted) {
			return noop;
		}

		const off = (bus?.on as ((...a: unknown[]) => () => void) | undefined)?.(
			...args,
		);
		if (!off) {
			return noop;
		}

		const stop = onAbort({ signal }, off);
		return () => {
			stop();
			off();
		};
	};

	const run = async <P, R>(fn: Task<P, E, R>, ...args: PayloadOf<P>) => {
		signal.throwIfAborted();

		const payload = args[0] as P;
		const child = createTask<E>({ type: event.type, payload }, bus, tracer, {
			signal,
			ref: meta?.ref,
		});

		try {
			return await traceRun(child.ctx, "run", () => fn(payload, child.ctx));
		} finally {
			child.unlink();
		}
	};

	const ctx = {
		type: event.type,
		payload: event.payload,
		signal,
		abort: (reason?: unknown) => controller.abort(reason),
		emit: taskEmit,
		on: taskOn,
		off: bus?.off ?? noop,
		run,
	} as unknown as Context<E>;
	if (meta) {
		metaOf.set(ctx, meta);
	}

	return { ctx, unlink };
};

type ForkParent<E extends EventMap> = {
	signal?: AbortSignal | undefined;
	type?: string;
	payload?: unknown;
	emit?: Emit<E>;
	on?: On<E>;
	off?: Off<E>;
};

/**
 * Child of `parent`: aborted with it, but cancellable on its own. `parent` is
 * a bus task context (the child is traced as its child) or any `{ signal }`.
 */
export const forkTask = <E extends EventMap>(parent: ForkParent<E>) => {
	const meta = metaOf.get(parent);

	return createTask<E>(
		{ type: parent.type ?? "", payload: parent.payload },
		{ emit: parent.emit, on: parent.on, off: parent.off },
		meta?.tracer,
		{ signal: parent.signal, ref: meta?.ref },
	);
};
