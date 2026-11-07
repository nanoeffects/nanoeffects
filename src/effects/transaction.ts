import type { Context } from "../core/bus";
import { createSettle, forkTask, traceTask } from "../core/context";
import type { EventMap } from "../core/types";
import { isContext, onAbort } from "../utils";
import { runTraced } from "./group";
import type { ChildOf, Starter } from "./run";

/** In which case a rollback is called: a step failed, the task was aborted, or either. */
export type RollbackOn = "both" | "error" | "abort";

/** What happens to the rollbacks that are left when one has failed. */
export type RollbackFailure = "continue" | "stop";

/** One at a time, last step first, or all at once. */
export type RollbackOrder = "reverse" | "parallel";

/**
 * One step of a transaction: `run` does the work and returns a value, `rollback`
 * takes that value back. `rollbackOn` and `rollbackFailure` here win over the
 * same options of the transaction.
 */
export type TransactionStep<Child = Context<EventMap>> = {
	/** Does the work. Gets the context of its own child task. */
	run: Starter<unknown, Child>;
	/**
	 * Takes the work back. Gets the value `run` returned and no abort signal. A step without one is skipped.
	 * The value is `any`: TypeScript cannot infer it from `run` of the same step in a list, so annotate it
	 * (`(orderId: string) => ...`) when you want it checked.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: the type of the value cannot be inferred from `run` in a list of steps
	rollback?: ((value: any) => unknown) | undefined;
	rollbackOn?: RollbackOn | null | undefined;
	rollbackFailure?: RollbackFailure | null | undefined;
};

/** Options of `transaction`: the rollback strategy for every step that does not set its own. */
export type TransactionOptions = {
	/** In which case a step is rolled back. Default `"both"`. */
	rollbackOn?: RollbackOn | null | undefined;
	/** Whether the rollbacks that are left run after one has failed. Default `"continue"`. */
	rollbackFailure?: RollbackFailure | null | undefined;
	/** `"reverse"` (default) calls the rollbacks one at a time, last step first; `"parallel"` calls them all at once. */
	rollbackOrder?: RollbackOrder | null | undefined;
};

/** The values of `run` of each step, in the order of the steps. */
export type TransactionValues<S extends readonly TransactionStep<never>[]> = {
	-readonly [K in keyof S]: Awaited<ReturnType<S[K]["run"]>>;
};

/** The options in front of positional steps: an object with a `run` is a step, not options. */
export type LeadingOptions = (TransactionOptions & { run?: never }) | null;

// One step written as an argument: `R` is what `run` returns, `rollback` gets what it resolves to.
type StepOf<R, Child> = {
	run: (child: Child) => R;
	rollback?: ((value: Awaited<R>) => unknown) | undefined;
	rollbackOn?: RollbackOn | null | undefined;
	rollbackFailure?: RollbackFailure | null | undefined;
};

export type StepsOf<R extends unknown[], Child> = {
	[K in keyof R]: StepOf<R[K], Child>;
};

export type ValuesOf<R extends unknown[]> = { [K in keyof R]: Awaited<R[K]> };

// What the code below sees of a step: the types of the values are checked at the call, not here.
type InternalStep = {
	run: (child: Context<EventMap>) => unknown;
	rollback?: ((value: unknown) => unknown) | undefined;
	rollbackOn?: RollbackOn | null | undefined;
	rollbackFailure?: RollbackFailure | null | undefined;
};

type Settings = {
	on: RollbackOn;
	failure: RollbackFailure;
	order: RollbackOrder;
};

type Finished = { step: InternalStep; value: unknown };

const WORDS: Record<string, readonly string[]> = {
	rollbackOn: ["both", "error", "abort"],
	rollbackFailure: ["continue", "stop"],
	rollbackOrder: ["reverse", "parallel"],
};

// A flow must not find a typo after it has charged a card: the options are checked before the first step
// (a step is checked for all three words too, so a `rollbackOrder` on a step is a typo-checked no-op)
const check = (holder: object) => {
	for (const [name, allowed] of Object.entries(WORDS)) {
		const value: unknown = Reflect.get(holder, name);
		if (value != null && !allowed.some((word) => word === value)) {
			throw new RangeError(`${name} must be ${allowed.join(" or ")}`);
		}
	}
};

// A task context has a `run` method too, so a context is told first: its `signal` is an object.
const hasSignal = (value: object): boolean =>
	isContext(Reflect.get(value, "signal"));

const isStep = (value: unknown): value is InternalStep =>
	isContext(value) &&
	!hasSignal(value) &&
	typeof Reflect.get(value, "run") === "function";

const settingsOf = (
	steps: readonly InternalStep[],
	options: TransactionOptions | null | undefined,
): Settings => {
	const given: TransactionOptions = options ?? {};
	check(given);
	for (const step of steps) {
		check(step);
	}

	const settings: Settings = {
		on: given.rollbackOn ?? "both",
		failure: given.rollbackFailure ?? "continue",
		order: given.rollbackOrder ?? "reverse",
	};
	// parallel rollbacks all start together: there is nothing for "stop" to stop
	const stops = steps.some(
		(step) => (step.rollbackFailure ?? settings.failure) === "stop",
	);
	if (settings.order === "parallel" && stops) {
		throw new TypeError('"stop" cannot go with rollbackOrder "parallel"');
	}

	return settings;
};

// true when the rollback went through; its error is kept otherwise
const attempt = async (
	{ step, value }: Finished,
	errors: unknown[],
): Promise<boolean> => {
	try {
		await step.rollback?.(value);

		return true;
	} catch (error) {
		errors.push(error);

		return false;
	}
};

const wantsRollback = (on: RollbackOn, aborted: boolean) =>
	on === "both" || on === (aborted ? "abort" : "error");

/** Rolls back the finished steps by the strategy and returns the errors of the rollbacks, in the order they happened. */
const rollBack = async (
	finished: readonly Finished[],
	aborted: boolean,
	settings: Settings,
): Promise<unknown[]> => {
	const chosen = finished.filter(
		({ step }) =>
			step.rollback && wantsRollback(step.rollbackOn ?? settings.on, aborted),
	);
	const errors: unknown[] = [];

	if (settings.order === "parallel") {
		await Promise.all(chosen.map((item) => attempt(item, errors)));

		return errors;
	}

	for (const item of chosen.reverse()) {
		const done = await attempt(item, errors);
		if (!done && (item.step.rollbackFailure ?? settings.failure) === "stop") {
			break;
		}
	}

	return errors;
};

// The group does not use `withGroup`: that rejects at the abort, and this result must wait for the rollback.
// The group reports the forward outcome as soon as it is known; the rollback runs after that.
const runTransaction = async (
	ctx: { signal?: AbortSignal | undefined },
	steps: readonly InternalStep[],
	settings: Settings,
): Promise<unknown[]> => {
	ctx.signal?.throwIfAborted();
	const { ctx: group, unlink } = forkTask<EventMap>(ctx);
	const settle = createSettle(group, "transaction");
	traceTask(group, "transaction", "start");
	onAbort(group, () => settle("cancel"));
	const finished: Finished[] = [];

	try {
		for (const step of steps) {
			group.signal.throwIfAborted();
			const value = await runTraced(group, (child) => step.run(child));
			finished.push({ step, value });
		}
		// a step that ignored the signal may have finished after the abort: it is rolled back, not returned
		group.signal.throwIfAborted();
		settle("done");

		return finished.map(({ value }) => value);
	} catch (error) {
		const aborted = group.signal.aborted;
		settle(aborted ? "cancel" : "error", error);
		const failures = await rollBack(finished, aborted, settings);
		if (failures.length === 0) {
			throw error;
		}

		throw new AggregateError([error, ...failures], "A rollback failed");
	} finally {
		unlink();
	}
};

/**
 * Runs the steps one after another and gives the values of their `run`. If a
 * step throws, or the task is aborted, the steps that finished are rolled back
 * (`rollback(value)`, last first by default) and the result rejects with the
 * error, or the abort reason, once the rollback is over. The step that failed
 * is not rolled back. `rollback` gets no abort signal, so the abort that
 * started a rollback does not cut it. If a rollback fails, the result is an
 * `AggregateError` with the original error first.
 *
 * The rollback strategy is set in `options` for every step and in a step for
 * that step alone (the step wins): `rollbackOn` (`"both"`, `"error"`,
 * `"abort"`), `rollbackFailure` (`"continue"`, `"stop"`); `rollbackOrder`
 * (`"reverse"`, `"parallel"`) is in `options` only. Retry a rollback by
 * wrapping it: `rollback: (value) => retry({}, () => api.cancel(value))`.
 *
 * Two forms: `transaction(ctx, steps, options)` inside a body, and
 * `transaction(steps, options)`, a starter for `all`, `race` and `allSettled`.
 * The state lives in memory: this is not a database transaction and it does
 * not survive a closed tab.
 *
 * @example
 * ```ts
 * bus.on("checkout", async (order, ctx) => {
 *   const [orderId, paymentId] = await transaction(ctx, [
 *     {
 *       run: ({ signal }) => api.createOrder(order, { signal }),
 *       rollback: (orderId) => api.cancelOrder(orderId),
 *     },
 *     {
 *       run: ({ signal }) => api.charge(order, { signal }),
 *       rollback: (paymentId) => api.refund(paymentId),
 *     },
 *   ]);
 * });
 * ```
 */
export function transaction<
	C extends { signal?: AbortSignal | undefined },
	const S extends readonly TransactionStep<ChildOf<C>>[],
>(
	ctx: C,
	steps: S,
	options?: TransactionOptions | null,
): Promise<TransactionValues<S>>;
// Without a context the call is a starter. The child type comes from the group that calls it.
export function transaction<
	Child,
	const S extends readonly TransactionStep<Child>[],
>(
	steps: S,
	options?: TransactionOptions | null,
): (child: Child) => Promise<TransactionValues<S>>;
// Steps as arguments: the type of the value of each `run` reaches its `rollback`. The forms with
// options are listed first; `LeadingOptions` refuses an object with a `run`, so a step (which has
// `rollbackOn` too) never passes for the options and the checker does not try the wrong form first.
export function transaction<
	C extends { signal: AbortSignal },
	R extends [unknown, ...unknown[]],
>(
	ctx: C,
	options: LeadingOptions,
	...steps: StepsOf<R, ChildOf<C>>
): Promise<ValuesOf<R>>;
export function transaction<
	C extends { signal: AbortSignal },
	R extends [unknown, ...unknown[]],
>(ctx: C, ...steps: StepsOf<R, ChildOf<C>>): Promise<ValuesOf<R>>;
export function transaction<Child, R extends [unknown, ...unknown[]]>(
	options: LeadingOptions,
	...steps: StepsOf<R, Child>
): (child: Child) => Promise<ValuesOf<R>>;
export function transaction<Child, R extends [unknown, ...unknown[]]>(
	...steps: StepsOf<R, Child>
): (child: Child) => Promise<ValuesOf<R>>;
export function transaction(...args: unknown[]): unknown {
	const [first, second, third] = args;
	if (Array.isArray(first)) {
		const steps: readonly InternalStep[] = first;
		// the second argument of the starter form is the options; the overloads allow nothing else there
		const options = second as TransactionOptions | null | undefined;
		const settings = settingsOf(steps, options);

		return (child: { signal?: AbortSignal | undefined }) =>
			runTransaction(child, steps, settings);
	}
	if (isContext(first) && Array.isArray(second)) {
		const steps: readonly InternalStep[] = second;
		const options = third as TransactionOptions | null | undefined;
		const settings = settingsOf(steps, options);

		return runTransaction(first, steps, settings);
	}
	// steps as arguments: a context has an object `signal`; any other object, `{}` too, is the options
	const withContext = isContext(first) && hasSignal(first);
	const rest = withContext ? args.slice(1) : args;
	const withOptions = !isStep(rest[0]);
	const options = withOptions ? (rest[0] as TransactionOptions | null) : null;
	const steps = withOptions ? rest.slice(1) : rest;
	if (steps.length === 0 || !steps.every(isStep)) {
		throw new TypeError(
			"A transaction takes steps with a run function: transaction(ctx, ...steps), transaction(...steps) or transaction(ctx, steps)",
		);
	}
	const settings = settingsOf(steps, options);
	if (withContext) {
		return runTransaction(first, steps, settings);
	}

	return (child: { signal?: AbortSignal | undefined }) =>
		runTransaction(child, steps, settings);
}
