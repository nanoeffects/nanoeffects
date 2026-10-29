/** What an emitter tells the trace about itself. */
export type OriginOptions = {
	/** Names the subscription that emits; it is the `type` of the root task of the trace. */
	traceId?: string;
	/** Names the flow the emit belongs to; every task below it has it too. */
	traceGroupId?: string;
};

/** The function that `tracePlugin` puts on the bus: emits an action from a root task of the trace. */
export type Origin = (
	action: { type: string; payload?: unknown },
	options?: OriginOptions,
) => void;

/**
 * Where `tracePlugin` puts the function that makes the root of an emitter. `Symbol.for`,
 * so `reactPlugin` and `emitterPlugin` find it without importing the code behind it.
 * `createBus` does not import this file.
 */
export const originKey = Symbol.for("nanoeffects.origin");
