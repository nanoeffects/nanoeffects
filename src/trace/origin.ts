import type { Bus, EventLike } from "../core/bus";
import { createTask, traceTask } from "../core/context";
import type { OriginOptions } from "../core/origin-key";
import type { EventMap } from "../core/types";

/**
 * Emits `action` on `bus` for an emitter that is not a task (`useEmitter`,
 * `bus.emitter`): from a root task, so what the event starts is below it and the
 * trace says which subscription began the chain. Without a tracer it is
 * `bus.emit(action)`.
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
