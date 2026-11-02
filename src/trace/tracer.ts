import { currentEmitter } from "../core/context";
import { combineLoggers } from "../core/logger";
import { scopeKey } from "../core/scope-key";
import { callBeingEmitted } from "../core/trace-call";
import type { Tracer } from "../core/tracer";
import type {
	EffectName,
	TaskInfo,
	Trace,
	TraceEvent,
	TraceLogger,
} from "../core/types";
import { isPromise, onAbort, report } from "../utils";

const noop = () => {};

// the flow a task declares: on the event itself (the root of an emitter), or in the scope of the call
// that `tracePlugin` says is being emitted
const groupOf = (event: { traceGroupId?: string }): string | undefined => {
	if (typeof event.traceGroupId === "string") {
		return event.traceGroupId;
	}
	const call = callBeingEmitted();
	if (
		(typeof call !== "object" && typeof call !== "function") ||
		call === null
	) {
		return;
	}
	const scope: unknown = Reflect.get(call, scopeKey);
	const own: unknown =
		typeof scope === "object" && scope !== null
			? Reflect.get(scope, "traceGroupId")
			: void 0;

	return typeof own === "string" ? own : void 0;
};

type Ref = {
	id: number;
	parent?: number | undefined;
	type: string;
	// the event a renamed listener handles
	event?: string | undefined;
	leaf?: boolean | undefined;
	emitted: boolean;
	parentRef?: Ref | undefined;
	payload: unknown;
	sampled: boolean;
	group?: string | undefined;
	// where a listener was registered, when `tracePlugin` was asked to record it
	source?: string | undefined;
	// the id of the root task of the chain: its own, or its parent’s
	root: number;
};

export type TracerOptions = {
	/** Drops the events it returns `false` for, before any logger sees them. */
	filter?: (event: TraceEvent) => boolean;
	/**
	 * Which root tasks to trace: a share between 0 and 1, or a function of the
	 * event. It is decided once per root task (a handler call) and every task
	 * below it follows, so a trace is never cut in the middle. Default: all.
	 */
	sample?: number | ((event: { type: string; payload: unknown }) => boolean);
};

/**
 * Makes the tracer for `createBus({ trace })` from one logger or several.
 * A tracer numbers the tasks it sees, so share one across buses only if the
 * ids should be unique across them. `options.filter` and `options.sample`
 * cut the volume, e.g. for production.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>({
 *   trace: createTracer([reduxDevtools({ name: "app" }), consoleLogger()]),
 * });
 *
 * // production: trace 5% of the handler calls, and only their failures
 * createTracer(logger, {
 *   sample: 0.05,
 *   filter: (event) => event.phase === "error",
 * });
 * ```
 */
export const createTracer = <E = Record<string, unknown>>(
	trace: Trace<E>,
	options: TracerOptions = {},
): Tracer => {
	// loggers are typed for the events of their bus; here events are plain
	const loggers = trace as Trace;
	const log = combineLoggers(loggers);
	const { filter, sample = 1 } = options;
	let lastId = 0;
	// loggers that want to see each task as it is made, also one that never reports an event
	const watchers = (Array.isArray(loggers) ? loggers : [loggers]).flatMap(
		(logger: TraceLogger) => (logger.task ? [logger.task] : []),
	);
	const announce = (ref: Ref) => {
		const info: TaskInfo = { ref, id: ref.id, type: ref.type };
		if (ref.parentRef) {
			info.parent = ref.parentRef;
		}
		if (ref.event !== void 0) {
			info.event = ref.event;
		}
		if (ref.leaf) {
			info.leaf = true;
		}
		info.emitted = ref.emitted;
		if (ref.group !== void 0) {
			info.traceGroupId = ref.group;
		}
		if (ref.source !== void 0) {
			info.source = ref.source;
		}
		for (const watch of watchers) {
			try {
				watch(info);
			} catch (error) {
				report("trace logger failed", error);
			}
		}
	};

	// a root task is sampled by `sample`; its children follow it
	const isSampled = (event: { type: string; payload?: unknown }) =>
		typeof sample === "function"
			? sample({ type: event.type, payload: event.payload })
			: Math.random() < sample;

	const tracer: Tracer<Ref> = {
		task: (event, parent) => {
			const ref: Ref = {
				id: ++lastId,
				root: parent?.root ?? lastId,
				parent: parent?.id,
				// kept only for a logger that watches tasks: a chain of refs would hold every ancestor alive
				parentRef: watchers.length > 0 ? parent : void 0,
				leaf: event.leaf,
				// an emit makes its tasks with the emitter as the parent; `ctx.run` and the effects name their own
				emitted: currentEmitter() === parent,
				type: event.type,
				payload: event.payload,
				sampled: parent?.sampled ?? isSampled(event),
				group: groupOf(event) ?? parent?.group,
			};
			if (watchers.length > 0 && ref.sampled) {
				announce(ref);
			}

			return ref;
		},

		rename: (ref, type, source) => {
			ref.event ??= ref.type;
			ref.type = type;
			if (source !== void 0) {
				ref.source = source;
			}
			if (watchers.length > 0 && ref.sampled) {
				announce(ref);
			}
		},

		report: (ref, effect, phase, error) => {
			if (!ref.sampled) {
				return;
			}

			const event: TraceEvent = {
				id: ref.id,
				type: ref.type,
				effect,
				phase,
				payload: ref.payload,
			};
			if (typeof ref.parent === "number") {
				event.parentId = ref.parent;
			}
			if (ref.root !== ref.id) {
				event.rootId = ref.root;
			}
			if (ref.group !== void 0) {
				event.traceGroupId = ref.group;
			}
			if (ref.source !== void 0) {
				event.source = ref.source;
			}
			if (phase === "error") {
				event.error = error;
			}
			if (!filter || filter(event)) {
				log?.(event);
			}
		},

		settler: (ref, effect) => {
			if (!ref.sampled) {
				return noop;
			}

			let settled = false;

			return (phase, error) => {
				if (!settled) {
					settled = true;
					tracer.report(ref, effect, phase, error);
				}
			};
		},

		run: <R>(
			ref: Ref,
			effect: EffectName,
			signal: AbortSignal,
			fn: () => R,
		): R => {
			if (!ref.sampled) {
				return fn();
			}

			const settle = tracer.settler(ref, effect);

			tracer.report(ref, effect, "start");
			onAbort({ signal }, () => settle("cancel"));

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
		},
	};

	return tracer;
};
