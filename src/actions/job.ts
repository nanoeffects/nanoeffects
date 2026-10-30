import type { Context } from "../core/bus";
import { makeCommandCall } from "../core/bus";
import { type EmitGate, emitAfterAbort } from "../core/emit-key";
import {
	callLifecycle,
	type Lifecycle,
	reportsLifecycle,
} from "../core/lifecycle-key";
import type { Scope } from "../core/scope-types";
import type { EventMap, Task } from "../core/types";
import type { FieldsOfScope, Scoped } from "../scope/types";
import { onAbort } from "../utils/onAbort";
import { report } from "../utils/report";
import { type ActionCreator, createAction } from "./action";
import { beneath, carriedBy, carry } from "./carry";
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
	// the listeners of the outcome get the fields of the job's scope too,
	// and the outcome action's own fields win over them
	const own = carriedBy(creator);
	ctx.emit(
		Reflect.apply(creator, null, [payload]),
		scope && own ? beneath(scope, own) : scope,
	);
};

// `cancel` can be sent after the abort, where `ctx.emit` does nothing: the context
// lets one emit through for the time of this call. A listener that throws must
// not reject the job.
const sendCancel = (
	ctx: Context<EventMap>,
	creator: Creator,
	reason: unknown,
	scope: Scope | undefined,
) => {
	const gate = ctx as EmitGate;
	gate[emitAfterAbort] = true;
	try {
		send(ctx, creator, reason, scope);
	} catch (error) {
		report("cancel listener", error);
	}
	gate[emitAfterAbort] = false;
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

/** What `createJob` returns: the command of the job, with its four actions as properties. */
export type Job<
	P,
	R,
	T extends string,
	S extends Outcome,
	F extends Outcome,
	PE extends Outcome = `${T}/pending`,
	CE extends Outcome = `${T}/cancel`,
> = MadeCommand<P, Promise<Awaited<R> | undefined>, T> & {
	/** Made from a string with the payload of the call as its payload, or the creator that was given. */
	readonly pending: PE extends string ? ActionCreator<P, PE> : PE;
	/** Made from a string with the result as its payload, or the creator that was given. */
	readonly success: S extends string ? ActionCreator<Awaited<R>, S> : S;
	/** Made from a string with the error as its payload, or the creator that was given. */
	readonly fail: F extends string ? ActionCreator<unknown, F> : F;
	/** Made from a string with the abort reason as its payload, or the creator that was given. */
	readonly cancel: CE extends string ? ActionCreator<unknown, CE> : CE;
};

/**
 * Creates a job: a command whose outcome is sent on as actions. When the
 * handler starts, `job.pending(payload)` is emitted on the bus. When it
 * succeeds, `job.success(result)` follows, and when it fails, `job.fail(error)`.
 * When the task is aborted after it started, `job.cancel(reason)` follows
 * instead. After `pending`, exactly one of the three closes the call. A job is
 * made for the case where nobody waits for the result and the bus carries it
 * on, like `createAsyncThunk` or an effector effect. It returns the command,
 * with the four actions on it.
 *
 * A scope as the last argument, `{ cache, $effects: { race } }`, gives the handler
 * and the listeners of the outcome those context fields; see `scopePlugin`.
 *
 * `pending`, `success`, `fail` and `cancel` are a type string, from which the
 * job makes an action creator with `createAction`, or an action creator that
 * exists already, which is used and returned as it is. A missing one is made
 * with the type `<type>/pending`, `<type>/success`, `<type>/fail` or
 * `<type>/cancel`.
 *
 * `bus.emit(job(payload))` returns a promise of the result. An error of the
 * handler always counts as handled: it goes to `job.fail` and the promise
 * resolves with `undefined`; a command is the tool for a result that must reject.
 * The actions are emitted as the task that ran the job, also for a handler bound
 * with `commands.handle`. Once the task is aborted, `success` and `fail` are
 * skipped and `cancel` is sent when the handler settles (a handler that never
 * settles sends nothing). A call that does not start, because a policy drops it
 * or it is aborted while it waits in a `queue`, sends none of the four. A
 * missing handler is not an outcome: `emit` throws `MissingHandlerError`.
 * Calling the job builds `{ type, payload }` like a command; it does not run
 * the handler.
 *
 * @example
 * ```ts
 * const loadUser = createJob("user/load", fetchUser);
 * let loading = false;
 *
 * bus.on(loadUser.pending, () => { loading = true; });
 * bus.on(loadUser.success, (user) => { loading = false; render(user); });
 * bus.on(loadUser.fail, () => { loading = false; });
 * bus.on(loadUser.cancel, () => { loading = false; });
 * bus.emit(loadUser("1")); // pending now, then success, fail or cancel
 * ```
 */
export const createJob = <
	P = void,
	R = void,
	T extends string = string,
	E extends EventMap = EventMap,
	S extends Outcome = `${T}/success`,
	F extends Outcome = `${T}/fail`,
	PE extends Outcome = `${T}/pending`,
	CE extends Outcome = `${T}/cancel`,
	X extends Scope = Record<never, never>,
>(
	type: T,
	handler?: Task<P, Scoped<E, X>, R>,
	outcomes: {
		/** Gets the payload of the call when the handler starts: a type to make an action creator of, or an action creator. */
		pending?: PE;
		/** Gets the result when the handler succeeds: a type to make an action creator of, or an action creator. */
		success?: S;
		/** Gets the error when the handler fails: a type to make an action creator of, or an action creator. */
		fail?: F;
		/** Gets the abort reason when the task is aborted before the handler settles: a type to make an action creator of, or an action creator. */
		cancel?: CE;
	} = {},
	/** Context values and `$effects` for the handler and for the listeners of the outcome; see `scopePlugin`. */
	scope?: X,
): CarryingCalls<
	Job<P, R, T, S, F, PE, CE>,
	P,
	Promise<Awaited<R> | undefined>,
	FieldsOfScope<E, X>
> => {
	const command = createCommand<P, R, T, Scoped<E, X>>(type, handler);
	const outcomeOf = (name: keyof typeof outcomes) =>
		creatorOf(outcomes[name] ?? `${type}/${name}`);
	const pendingAction = outcomeOf("pending");
	const successAction = outcomeOf("success");
	const failAction = outcomeOf("fail");
	const cancelAction = outcomeOf("cancel");

	// Runs `base` and sends its outcome on. A call is idle until its handler starts,
	// started until it is closed by `success`, `fail` or `cancel`, and then closed. A
	// policy around the handler (`managed`) tells when it starts, drops or cancels the
	// call; without one the handler starts at the call.
	const route = (
		base: (payload: never, ctx: never) => unknown,
		payload: unknown,
		ctx: unknown,
		managed: boolean,
	) => {
		const task = ctx as Context<EventMap>;
		let phase: "idle" | "started" | "closed" = "idle";
		let stopWatching = () => {};

		const close = () => {
			phase = "closed";
			stopWatching();
		};
		// the abort of the task, and a policy that cancels a call, both end it at once
		const cancelCall = (reason: unknown) => {
			if (phase === "started") {
				close();
				sendCancel(task, cancelAction, reason, scope);
			}
		};
		// a listener of `pending` that throws is a failure of the call, like the handler
		const start = () => {
			if (phase === "idle") {
				phase = "started";
				stopWatching = onAbort(task, cancelCall);
				send(task, pendingAction, payload, scope);
			}
		};
		// closes a started call with what its handler returned or threw
		const settle = (settled: { value: unknown } | { error: unknown }) => {
			if (phase !== "started") {
				return;
			}
			close();
			if (task.signal.aborted) {
				sendCancel(task, cancelAction, task.signal.reason, scope);
			} else if ("error" in settled) {
				send(task, failAction, settled.error, scope);
			} else {
				send(task, successAction, settled.value, scope);
			}
		};
		const lifecycle: Lifecycle = {
			start,
			cancel: cancelCall,
			done: settle,
			drop: () => {
				if (phase === "idle") {
					phase = "closed";
				}
			},
		};
		Reflect.set(task, callLifecycle, lifecycle);

		const outcome = attempt(() => {
			if (!managed) {
				start();
			}
			return Reflect.apply(base, null, [payload, ctx]);
		});

		return outcome.then(
			(value) => {
				settle({ value });
				return value;
			},
			(error: unknown) => {
				// an error with no start is a failure that a policy did not report: keep the pair
				if (phase === "idle") {
					try {
						start();
					} catch (listenerError) {
						report("pending listener", listenerError);
					}
				}
				settle({ error });
			},
		);
	};

	// a policy around the handler reports when it starts; the job waits for that
	const wrap = (base: (payload: never, ctx: never) => unknown) => {
		const managed = Reflect.get(base, reportsLifecycle) === true;

		return (payload: never, ctx: never) => route(base, payload, ctx, managed);
	};

	// a handler that is a library policy reports when its calls start, as a bound one does
	const managed = Reflect.get(handler ?? {}, reportsLifecycle) === true;

	// with a context the bus is running it; without, build the call for emit
	function invoke(payload: P, ctx?: Context<E>) {
		if (typeof ctx === "object") {
			// without a handler the command throws; `pending` would have no end
			if (!handler) {
				return Reflect.apply(command, null, [payload, ctx]);
			}
			return route(command, payload, ctx, managed);
		}
		return carry(makeCommandCall(job, type, payload), scope);
	}

	const made = Object.assign(invoke, {
		type,
		match: command.match,
		wrap,
		pending: pendingAction,
		success: successAction,
		fail: failAction,
		cancel: cancelAction,
	}) as Job<P, R, T, S, F, PE, CE>;
	const job = carry(made, scope);

	return job as CarryingCalls<
		Job<P, R, T, S, F, PE, CE>,
		P,
		Promise<Awaited<R> | undefined>,
		FieldsOfScope<E, X>
	>;
};
