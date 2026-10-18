import { combineLoggers } from "../logger";
import type { Tracer } from "../tracer";
import type { EffectName, Trace, TraceEvent } from "../types";
import { isPromise, onAbort } from "../utils";

const noop = () => {};

type Ref = {
	id: number;
	parent?: number | undefined;
	type: string;
	payload: unknown;
	sampled: boolean;
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
	const log = combineLoggers(trace as Trace);
	const { filter, sample = 1 } = options;
	let lastId = 0;

	const tracer: Tracer<Ref> = {
		task: (event, parent) => ({
			id: ++lastId,
			parent: parent?.id,
			type: event.type,
			payload: event.payload,
			sampled:
				parent?.sampled ??
				(typeof sample === "function"
					? sample({ type: event.type, payload: event.payload })
					: Math.random() < sample),
		}),

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
				event.parent = ref.parent;
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
