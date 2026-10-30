import type { Context } from "../core/bus";
import type { EventMap, Task } from "../core/types";
import { isContext } from "../utils";

/**
 * What the Task of `retry`, `timeout` and `poll` is: a Task for every payload, and a starter of
 * `race`, `all` and `allSettled` when its function accepts `undefined` as the payload (a group has
 * none). The Task signature is last: TypeScript infers a handler from the last one.
 */
export type Startable<P, E extends EventMap, R> =
	StarterPayload<P, E> extends true
		? {
				(child: Context<E>): R;
				(payload: P, ctx: Context<E>): R;
			}
		: Task<P, E, R>;

// A group gives a starter its child, so a function written as `(_, ctx) => …` inside a group gets the
// child as its contextual payload type: that fits as well as a payload that can be `undefined`.
type StarterPayload<P, E extends EventMap> = undefined extends P
	? true
	: Context<E> extends P
		? true
		: false;

const needsContext = () =>
	new TypeError(
		"A Task is called as (payload, ctx), or as (ctx) when a group starts it; the single argument is not a context",
	);

const starterContext = (value: unknown): Context<EventMap> => {
	if (isContext(value) && "signal" in value) {
		return value as Context<EventMap>;
	}

	throw needsContext();
};

/**
 * Runs a Task. A group starts it with one argument, its child context; the bus, `ctx.run` and the
 * policies always pass the context as the second, so a missing one tells the two calls apart.
 */
export const runTaskOrStarter = <R>(
	payload: unknown,
	ctx: Context<EventMap> | undefined,
	run: (ctx: Context<EventMap>, payload: unknown) => R,
): R =>
	ctx === void 0 ? run(starterContext(payload), void 0) : run(ctx, payload);
