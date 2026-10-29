import { combineLoggers } from "../core/logger";
import { scopeKey } from "../core/scope-key";
import { callBeingEmitted } from "../core/trace-call";
import type { Tracer } from "../core/tracer";
import type { EffectName, Trace, TraceEvent } from "../core/types";
import { isPromise, onAbort } from "../utils";

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
	payload: unknown;
	sampled: boolean;
	group?: string | undefined;
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

	// a root task is sampled by `sample`; its children follow it
	const isSampled = (event: { type: string; payload?: unknown }) =>
		typeof sample === "function"
			? sample({ type: event.type, payload: event.payload })
			: Math.random() < sample;

	const tracer: Tracer<Ref> = {
		task: (event, parent) => ({
			id: ++lastId,
			root: parent?.root ?? lastId,
			parent: parent?.id,
			type: event.type,
			payload: event.payload,
			sampled: parent?.sampled ?? isSampled(event),
			group: groupOf(event) ?? parent?.group,
		}),

		rename: (ref, type) => {
			ref.type = type;
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
