import { combineLoggers } from "../logger";
import type { Tracer } from "../tracer";
import type { EffectName, Trace, TraceEvent } from "../types";
import { isPromise, onAbort } from "../utils";

type Ref = {
	id: number;
	parent?: number | undefined;
	type: string;
	payload: unknown;
};

/**
 * Makes the tracer for `createBus({ trace })` from one logger or several.
 * A tracer numbers the tasks it sees, so share one across buses only if the
 * ids should be unique across them.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>({
 *   trace: createTracer([reduxDevtools({ name: "app" }), consoleLogger()]),
 * });
 * ```
 */
export const createTracer = <E = Record<string, unknown>>(
	trace: Trace<E>,
): Tracer => {
	// loggers are typed for the events of their bus; here events are plain
	const log = combineLoggers(trace as Trace);
	let lastId = 0;

	const tracer: Tracer<Ref> = {
		task: (event, parent) => ({
			id: ++lastId,
			parent: parent?.id,
			type: event.type,
			payload: event.payload,
		}),

		report: (ref, effect, phase, error) => {
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
			log?.(event);
		},

		settler: (ref, effect) => {
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
			const settle = tracer.settler(ref, effect);

			tracer.report(ref, effect, "start");
			onAbort(() => settle("cancel"), { signal });

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
