import type { Context, Emit } from "./bus";
import type {
	EffectName,
	EventMap,
	PayloadOf,
	Phase,
	Task,
	TraceEvent,
	TraceLogger,
} from "./types";
import { isPromise, linkedController } from "./utils";

type Event = { type: string; payload?: unknown };

export type Tracer = {
	trace?: TraceLogger | null;
	nextId: () => number;
};

type TaskMeta = { id: number; parent?: number | undefined; tracer: Tracer };

const noTracer: Tracer = { nextId: () => 0 };
const metaOf = new WeakMap<object, TaskMeta>();

/** Reports a phase of `ctx` to the bus `trace` hook; no-op without a hook. */
export const traceTask = <E extends EventMap>(
	ctx: Context<E>,
	effect: EffectName,
	phase: Phase,
	error?: unknown,
) => {
	const meta = metaOf.get(ctx);
	if (!meta?.tracer.trace) {
		return;
	}

	const event: TraceEvent = {
		id: meta.id,
		type: ctx.type,
		effect,
		phase,
		payload: ctx.payload,
	};
	if (typeof meta.parent === "number") {
		event.parent = meta.parent;
	}
	if (phase === "error") {
		event.error = error;
	}
	meta.tracer.trace(event);
};

/** True for a context created by the bus, i.e. one that can be traced. */
export const hasTask = (value: object): value is Context<EventMap> =>
	metaOf.has(value);

/**
 * Runs `fn`, reporting `start` and then `done` / `error` of its (sync or async)
 * result, or `cancel` if `ctx` is aborted first.
 */
export const traceRun = <E extends EventMap, R>(
	ctx: Context<E>,
	effect: EffectName,
	fn: () => R,
): R => {
	let settled = false;
	const settle = (phase: Phase, error?: unknown) => {
		if (!settled) {
			settled = true;
			traceTask(ctx, effect, phase, error);
		}
	};

	ctx.signal.addEventListener("abort", () => settle("cancel"), { once: true });
	traceTask(ctx, effect, "start");
	if (ctx.signal.aborted) {
		settle("cancel");
	}

	let result: R;
	try {
		result = fn();
	} catch (error) {
		settle("error", error);
		throw error;
	}

	if (isPromise(result)) {
		return Promise.resolve(result).then(
			(value) => {
				settle("done");
				return value;
			},
			(error: unknown) => {
				settle("error", error);
				throw error;
			},
		) as R;
	}

	settle("done");
	return result;
};

/**
 * Creates the context of one task. Its signal follows `parent`; `unlink`
 * detaches it from `parent` once the task is finished.
 */
export const createTask = <E extends EventMap>(
	event: Event,
	emit: Emit<E>,
	tracer: Tracer,
	parent?: { signal: AbortSignal; id?: number | undefined },
) => {
	const { controller, unlink } = linkedController(parent?.signal);
	const { signal } = controller;

	const meta: TaskMeta = { id: tracer.nextId(), parent: parent?.id, tracer };

	const taskEmit = (...args: unknown[]) => {
		if (signal.aborted) {
			return;
		}
		return (emit as (...a: unknown[]) => unknown)(...args);
	};

	const run = async <P, R>(fn: Task<P, E, R>, ...args: PayloadOf<P>) => {
		signal.throwIfAborted();

		const payload = args[0] as P;
		const child = createTask<E>({ type: event.type, payload }, emit, tracer, {
			signal,
			id: meta.id,
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
		run,
	} as unknown as Context<E>;
	metaOf.set(ctx, meta);

	return { ctx, unlink };
};

/** Child of `ctx` for policies: aborted with `ctx`, but cancellable on its own. */
export const forkTask = <E extends EventMap>(ctx: Context<E>) =>
	createTask<E>(ctx, ctx.emit, metaOf.get(ctx)?.tracer ?? noTracer, {
		signal: ctx.signal,
		id: metaOf.get(ctx)?.id,
	});
