import type { Command, Context, Emittable } from "../core/bus";
import type { EventMap, Task } from "../core/types";
import { createCommand, MissingHandlerError } from "./command";

const send = (
	ctx: Context<EventMap>,
	target: Emittable<EventMap>,
	payload: unknown,
) => {
	const emit = ctx.emit as (event: unknown, payload?: unknown) => unknown;

	if (typeof target === "string") {
		emit(target, payload);
	} else if (typeof target === "function") {
		// an action creator is an event of its type; a command runs its handler
		emit("match" in target ? target.type : target, payload);
	} else {
		emit({ type: target.type, payload });
	}
};

// a sync throw becomes a rejection; a missing handler is a mistake, so it is thrown
const attempt = <T>(fn: () => T): Promise<Awaited<T>> => {
	try {
		return Promise.resolve(fn());
	} catch (error) {
		if (error instanceof MissingHandlerError) {
			throw error;
		}
		return Promise.reject(error);
	}
};

/**
 * Creates a command whose outcome is sent on: when the handler succeeds, its
 * result goes to `done`, and when it fails, the error goes to `fail`. Each is
 * anything `emit` takes as its first argument, and receives the result (or the
 * error) as the payload: an event type, an action creator, a command, or a
 * plain action. It is made for the case where nobody waits for the result and
 * the bus carries it on, like `createAsyncThunk` or an effector effect.
 *
 * `bus.emit(job, payload)` returns a promise of the result. When `fail` is set
 * the error counts as handled: it goes to `fail` and the promise resolves with
 * `undefined`; without `fail` the promise rejects. The outcome is routed by the
 * bus, also for a handler bound with `commands.handle`, and is skipped once the
 * task is aborted. Calling the job directly runs only its handler.
 *
 * @example
 * ```ts
 * const loaded = createAction<User>("user/loaded");
 * const failed = createAction<Error>("user/failed");
 *
 * const loadUser = createJob("user/load", fetchUser, { done: loaded, fail: failed });
 *
 * bus.on(loaded, (user) => render(user));
 * bus.emit(loadUser, "1"); // loaded(user) or failed(error) comes later
 * ```
 */
export const createJob = <
	P = void,
	R = void,
	T extends string = string,
	E extends EventMap = EventMap,
>(
	type: T,
	handler?: Task<P, E, R>,
	outcomes: {
		/** Gets the result when the handler succeeds. */
		done?: Emittable<E>;
		/** Gets the error when the handler fails. */
		fail?: Emittable<E>;
	} = {},
): Command<P, Promise<Awaited<R> | undefined>> & { readonly type: T } => {
	const command = createCommand<P, R, T, E>(type, handler);

	// runs `base` and sends its outcome on
	const route = (
		base: (payload: never, ctx: never) => unknown,
		payload: unknown,
		ctx: unknown,
	) => {
		const task = ctx as Context<EventMap>;
		const outcome = attempt(() => Reflect.apply(base, null, [payload, ctx]));

		return outcome.then(
			(value) => {
				if (outcomes.done) {
					send(task, outcomes.done, value);
				}
				return value;
			},
			(error: unknown) => {
				if (!outcomes.fail) {
					throw error;
				}
				send(task, outcomes.fail, error);
			},
		);
	};

	// with a context (a bus runs it) the outcome is routed; without, only the handler runs
	const run = (payload: P, ctx?: Context<E>) => {
		const result = ctx
			? route(command, payload, ctx)
			: attempt(() => command(payload));

		return result as Promise<Awaited<R>>;
	};

	const wrap =
		(base: (payload: never, ctx: never) => unknown) =>
		(payload: never, ctx: never) =>
			route(base, payload, ctx);

	return Object.assign(run, { type, wrap });
};
