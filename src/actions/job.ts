import type { Context } from "../core/bus";
import { makeCommandCall } from "../core/bus";
import type { Scope } from "../core/scope-types";
import type { EventMap, Task } from "../core/types";
import type { FieldsOfScope, Scoped } from "../scope/types";
import { type ActionCreator, createAction } from "./action";
import { carry } from "./carry";
import {
	type CarryingCalls,
	createCommand,
	type MadeCommand,
	MissingHandlerError,
} from "./command";

// what a given outcome can be besides a string: an action creator, made by `createAction`
type Creator = {
	(...args: never[]): { type: string; payload?: unknown };
	readonly type: string;
};

type Outcome = string | Creator;

// an action creator for an outcome: a string makes one, a creator is used as it is
const creatorOf = (target: Outcome): Creator =>
	typeof target === "string" ? createAction(target) : target;

// the action of the outcome, emitted as the task that ran the job
const send = (
	ctx: Context<EventMap>,
	creator: Creator,
	payload: unknown,
	scope: Scope | undefined,
) => {
	const emit = ctx.emit as (event: unknown, scope?: Scope) => unknown;

	// the listeners of the outcome get the fields of the job's scope too
	emit(Reflect.apply(creator, null, [payload]), scope);
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

/** What `createJob` returns: the command of the job, with its two actions as properties. */
export type Job<
	P,
	R,
	T extends string,
	S extends Outcome,
	F extends Outcome,
> = MadeCommand<P, Promise<Awaited<R> | undefined>, T> & {
	/** Made from a string with the result as its payload, or the creator that was given. */
	readonly success: S extends string ? ActionCreator<Awaited<R>, S> : S;
	/** Made from a string with the error as its payload, or the creator that was given. */
	readonly fail: F extends string ? ActionCreator<unknown, F> : F;
};

/**
 * Creates a job: a command whose outcome is sent on as actions. When the
 * handler succeeds, `job.success(result)` is emitted on the bus, and when it
 * fails, `job.fail(error)`. It is made for the case where nobody waits for
 * the result and the bus carries it on, like `createAsyncThunk` or an effector
 * effect. It returns the command, with the two actions on it: `job.success` and
 * `job.fail`.
 *
 * A scope as the last argument, `{ cache, effects: { race } }`, gives the handler
 * and the listeners of the outcome those context fields; see `scopePlugin`.
 *
 * `success` and `fail` are a type string, from which the job makes an action
 * creator with `createAction`, or an action creator that exists already, which
 * is used and returned as it is. A missing one is made with the type
 * `<type>/success` or `<type>/fail`.
 *
 * `bus.emit(job(payload))` returns a promise of the result. An error of the
 * handler always counts as handled: it goes to `job.fail` and the promise
 * resolves with `undefined`; a command is the tool for a result that must reject.
 * The actions are emitted as the task that ran the job, also for a handler bound
 * with `commands.handle`, and are skipped once the task is aborted. A missing
 * handler is not an outcome: `emit` throws `MissingHandlerError`. Calling the
 * job builds `{ type, payload }` like a command; it does not run the handler.
 *
 * @example
 * ```ts
 * const loadUser = createJob("user/load", fetchUser, {
 *   success: "user/loaded",
 *   fail: "user/failed",
 * });
 *
 * bus.on(loadUser.success, (user) => render(user));
 * bus.emit(loadUser("1")); // loadUser.success(user) or loadUser.fail(error) comes later
 * ```
 */
export const createJob = <
	P = void,
	R = void,
	T extends string = string,
	E extends EventMap = EventMap,
	S extends Outcome = `${T}/success`,
	F extends Outcome = `${T}/fail`,
	X extends Scope = Record<never, never>,
>(
	type: T,
	handler?: Task<P, Scoped<E, X>, R>,
	outcomes: {
		/** Gets the result when the handler succeeds: a type to make an action creator of, or an action creator. */
		success?: S;
		/** Gets the error when the handler fails: a type to make an action creator of, or an action creator. */
		fail?: F;
	} = {},
	/** Context values and `effects` for the handler and for the listeners of the outcome; see `scopePlugin`. */
	scope?: X,
): CarryingCalls<
	Job<P, R, T, S, F>,
	P,
	Promise<Awaited<R> | undefined>,
	FieldsOfScope<E, X>
> => {
	const command = createCommand<P, R, T, EventMap>(
		type,
		handler as Task<P, EventMap, R> | undefined,
	);
	const successAction = creatorOf(outcomes.success ?? `${type}/success`);
	const failAction = creatorOf(outcomes.fail ?? `${type}/fail`);

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
				send(task, successAction, value, scope);
				return value;
			},
			(error: unknown) => {
				send(task, failAction, error, scope);
			},
		);
	};

	const wrap =
		(base: (payload: never, ctx: never) => unknown) =>
		(payload: never, ctx: never) =>
			route(base, payload, ctx);

	// with a context the bus is running it; without, build the call for emit
	function invoke(payload: P, ctx?: Context<E>) {
		if (typeof ctx === "object") {
			return route(command, payload, ctx);
		}
		return carry(makeCommandCall(job, type, payload), scope);
	}

	const made = Object.assign(invoke, {
		type,
		match: command.match,
		wrap,
		success: successAction,
		fail: failAction,
	}) as Job<P, R, T, S, F>;
	const job = carry(made, scope);

	return job as CarryingCalls<
		Job<P, R, T, S, F>,
		P,
		Promise<Awaited<R> | undefined>,
		FieldsOfScope<E, X>
	>;
};
