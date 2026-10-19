import type { Command, Context } from "../core/bus";
import type { EventMap, Task } from "../core/types";
import { type ActionCreator, createAction } from "./action";
import { createCommand, MissingHandlerError } from "./command";

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
const send = (ctx: Context<EventMap>, creator: Creator, payload: unknown) => {
	const emit = ctx.emit as (event: unknown) => unknown;

	emit(Reflect.apply(creator, null, [payload]));
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

/** What `createJob` returns: the command of the job and the actions of its outcome. */
export type Job<
	P,
	R,
	T extends string,
	S extends Outcome,
	F extends Outcome,
> = {
	command: Command<P, Promise<Awaited<R> | undefined>> & { readonly type: T };
	/** Made from a string with the result as its payload, or the creator that was given. */
	successAction: S extends string ? ActionCreator<Awaited<R>, S> : S;
	/** Made from a string with the error as its payload, or the creator that was given. */
	failAction: F extends string ? ActionCreator<unknown, F> : F;
};

/**
 * Creates a job: a command whose outcome is sent on as actions. When the
 * handler succeeds, `successAction(result)` is emitted on the bus, and when it
 * fails, `failAction(error)`. It is made for the case where nobody waits for
 * the result and the bus carries it on, like `createAsyncThunk` or an effector
 * effect. It returns the three together: `{ command, successAction, failAction }`.
 *
 * `success` and `fail` are a type string, from which the job makes an action
 * creator with `createAction`, or an action creator that exists already, which
 * is used and returned as it is. A missing one is made with the type
 * `<type>/success` or `<type>/fail`.
 *
 * `bus.emit(command, payload)` returns a promise of the result. An error of the
 * handler always counts as handled: it goes to `failAction` and the promise
 * resolves with `undefined`; a command is the tool for a result that must reject.
 * The actions are emitted as the task that ran the job, also for a handler bound
 * with `commands.handle`, and are skipped once the task is aborted. A missing
 * handler is not an outcome: `emit` throws `MissingHandlerError`. Calling the
 * command directly runs only its handler.
 *
 * @example
 * ```ts
 * const { command: loadUser, successAction: userLoaded, failAction: userFailed } =
 *   createJob("user/load", fetchUser, { success: "user/loaded", fail: "user/failed" });
 *
 * bus.on(userLoaded, (user) => render(user));
 * bus.emit(loadUser, "1"); // userLoaded(user) or userFailed(error) comes later
 * ```
 */
export const createJob = <
	P = void,
	R = void,
	T extends string = string,
	E extends EventMap = EventMap,
	S extends Outcome = `${T}/success`,
	F extends Outcome = `${T}/fail`,
>(
	type: T,
	handler?: Task<P, E, R>,
	outcomes: {
		/** Gets the result when the handler succeeds: a type to make an action creator of, or an action creator. */
		success?: S;
		/** Gets the error when the handler fails: a type to make an action creator of, or an action creator. */
		fail?: F;
	} = {},
): Job<P, R, T, S, F> => {
	const command = createCommand<P, R, T, E>(type, handler);
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
				send(task, successAction, value);
				return value;
			},
			(error: unknown) => {
				send(task, failAction, error);
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

	return {
		command: Object.assign(run, { type, wrap }),
		successAction: successAction as Job<P, R, T, S, F>["successAction"],
		failAction: failAction as Job<P, R, T, S, F>["failAction"],
	};
};
