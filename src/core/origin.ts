import type { Bus, EventLike } from "./bus";
import { createTask, traceTask } from "./context";
import type { EventMap } from "./types";

/** What an emitter tells the trace about itself. */
export type OriginOptions = {
	/** Names the subscription that emits; it is the `type` of the root task of the trace. */
	traceId?: string;
	/** Names the flow the emit belongs to; every task below it has it too. */
	traceGroupId?: string;
};

/**
 * Emits `action` on `bus` for an emitter that is not a task (`useEmitter`,
 * `bus.emitter`). Without a tracer it is `bus.emit(action)`. With one the emit
 * is made from a root task, so what the event starts is its children and the
 * trace says which subscription began the chain.
 *
 * @internal
 */
export const emitFrom = <E extends EventMap>(
	bus: Bus<E>,
	action: EventLike<E>,
	options: OriginOptions = {},
) => {
	const { trace } = bus;
	if (!trace) {
		bus.emit(action);
		return;
	}

	const { traceId, traceGroupId } = options;
	const { ctx, unlink } = createTask<E>({
		event: {
			type: traceId ?? action.type,
			payload: action,
			...(traceGroupId === void 0 ? {} : { traceGroupId }),
		},
		// read now: a plugin that is used later has chained `addContext` already
		bus: {
			emit: bus.emit,
			on: bus.on,
			off: bus.off,
			ctx: bus.ctx,
			addContext: bus.addContext,
		},
		tracer: trace,
	});

	traceTask(ctx, "run", "start");
	try {
		ctx.emit(action);
		traceTask(ctx, "run", "done");
	} catch (error) {
		traceTask(ctx, "run", "error", error);
		throw error;
	} finally {
		unlink();
	}
};
