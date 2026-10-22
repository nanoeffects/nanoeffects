import { linkedController, onAbort } from "../utils";
import type { Context, Emit, Off, On } from "./bus";
import { TRACE } from "./flag";
import type { TaskRef, Tracer } from "./tracer";
import type { EffectName, EventMap, PayloadOf, Phase, Task } from "./types";

type Event = { type: string; payload?: unknown };

type TaskMeta = { tracer: Tracer; ref: TaskRef };

const metaOf = new WeakMap<object, TaskMeta>();

// The task whose `ctx.emit` is running. Tasks that this emit starts (listeners,
// commands) become its children in the trace. It is set only for the duration
// of the synchronous emit, so a plain `bus.emit` is not linked to anyone.
let emitter: TaskRef | undefined;

export const currentEmitter = () => emitter;
const noop = () => {};

/** Reports a phase of `ctx` to the bus tracer; no-op without one. */
export const traceTask = <E extends EventMap>(
	ctx: Context<E>,
	effect: EffectName,
	phase: Phase,
	error?: unknown,
) => {
	const meta = TRACE && metaOf.get(ctx);
	if (meta) {
		meta.tracer.report(meta.ref, effect, phase, error);
	}
};

/** Returns `settle(phase, error?)` that reports only the first phase of `ctx`. */
export const createSettle = <E extends EventMap>(
	ctx: Context<E>,
	effect: EffectName,
): ((phase: Phase, error?: unknown) => void) => {
	const meta = TRACE && metaOf.get(ctx);

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
	const meta = TRACE && metaOf.get(ctx);

	return meta ? meta.tracer.run(meta.ref, effect, ctx.signal, fn) : fn();
};

/** The parts of the bus a task context forwards to; all absent for a plain `{ signal }` parent. */
type TaskBus<E extends EventMap> = {
	emit?: Emit<E> | undefined;
	on?: On<E> | undefined;
	off?: Off<E> | undefined;
	/** Fields the user adds to every context, or a function that makes them for a task; see `BusOptions.context`. */
	ctx?: unknown;
	/** Adds fields to each new context; see `Bus.addContext`. */
	addContext?: ((ctx: object) => void) | undefined;
};

// the fields come from the user's `BusOptions.context`: an object, or a function of the task
const fieldsOf = (context: unknown, event: Event): object | undefined => {
	if (typeof context !== "function") {
		return context as object | undefined;
	}
	const make = context as (event: Event) => object;

	return make(event);
};

/** What `createTask` takes. */
type TaskInit<E extends EventMap> = {
	/** The event the task works on. */
	event: Event;
	/** What the context forwards to; absent for a task that is made without a bus. */
	bus?: TaskBus<E> | undefined;
	tracer?: Tracer | undefined;
	/** The task this one belongs to: it follows its signal and is its child in the trace. */
	parent?: { signal?: AbortSignal | undefined; ref?: TaskRef | undefined };
};

// the fields of a context follow from the event it is for, so no literal can be checked against it
const asContext = <E extends EventMap>(task: object) => task as Context<E>;

/**
 * Creates the context of one task. Its signal follows `parent`; `unlink`
 * detaches it from `parent` once the task is finished.
 */
export const createTask = <E extends EventMap>({
	event,
	bus,
	tracer,
	parent,
}: TaskInit<E>) => {
	const { controller, unlink } = linkedController(parent?.signal);
	const { signal } = controller;

	const meta =
		TRACE && tracer ? { tracer, ref: tracer.task(event, parent?.ref) } : void 0;

	const taskEmit = (...args: unknown[]) => {
		if (signal.aborted) {
			return;
		}
		const emit = bus?.emit as ((...a: unknown[]) => unknown) | undefined;
		const outer = emitter;
		emitter = meta?.ref;

		try {
			return emit?.(...args);
		} finally {
			emitter = outer;
		}
	};

	const taskOn = (...args: unknown[]) => {
		if (signal.aborted) {
			return noop;
		}

		const on = bus?.on as ((...a: unknown[]) => () => void) | undefined;
		const off = on?.(...args);
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
		const child = createTask<E>({
			event: { type: event.type, payload },
			bus,
			tracer,
			parent: { signal, ref: meta?.ref },
		});

		try {
			return await traceRun(child.ctx, "run", () => fn(payload, child.ctx));
		} finally {
			child.unlink();
		}
	};

	const ctx = asContext<E>({
		...fieldsOf(bus?.ctx, event),
		type: event.type,
		payload: event.payload,
		signal,
		abort: (reason?: unknown) => controller.abort(reason),
		emit: taskEmit,
		on: taskOn,
		off: bus?.off ?? noop,
		run,
	});
	bus?.addContext?.(ctx);
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
export const forkTask = <E extends EventMap>(
	parent: ForkParent<E>,
	type?: string,
) => {
	const meta = TRACE ? metaOf.get(parent) : void 0;

	return createTask<E>({
		event: { type: type ?? parent.type ?? "", payload: parent.payload },
		bus: {
			emit: parent.emit,
			on: parent.on,
			off: parent.off,
			// the fields of the parent context that are not the library's are the user's
			ctx: parent,
		},
		tracer: meta?.tracer,
		parent: { signal: parent.signal, ref: meta?.ref },
	});
};
