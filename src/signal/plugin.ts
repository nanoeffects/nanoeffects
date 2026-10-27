import {
	type Bus,
	type CommandCall,
	commandOf,
	type Emit,
	type EventLike,
} from "../core/bus";
import type { EmitScope, WithScope } from "../core/scope-types";
import type { EventMap } from "../core/types";
import { isPromise, onAbort } from "../utils";

/** What the second argument of `emit` takes besides the fields of a scope. */
export type SignalOption = {
	/** Aborts the tasks that this `emit` starts, with its reason, when it aborts. */
	signal?: AbortSignal;
};

/** `emit` of a bus with `signalPlugin`: the call forms take `{ signal }` as their second argument. */
export type SignalEmit<E extends EventMap> = Emit<E> & {
	<P, R, F>(
		call: CommandCall<P, R> & WithScope<F>,
		options: SignalOption & EmitScope<E, F>,
	): R;
	<P, R>(call: CommandCall<P, R>, options: SignalOption & EmitScope<E>): R;
	(event: EventLike<E>, options: SignalOption & EmitScope<E>): void;
};

/** A bus with `signalPlugin`: the same bus, with the `emit` that takes a signal. */
export type SignalBus<E extends EventMap> = Bus<E> & { emit: SignalEmit<E> };

type Emitter = (event: unknown, ...rest: unknown[]) => unknown;

// the contexts that one emit made, to abort together
type Linked = { target: object }[];
type Abortable = { abort: (reason?: unknown) => void };

const isObject = (value: unknown): value is object =>
	typeof value === "object" && value !== null;

// The signal an emit was given: a call form (an object or a command) takes it as its second argument.
const signalOf = (event: unknown, rest: unknown[]) => {
	const options = rest[0];
	if (
		!(isObject(options) && (isObject(event) || typeof event === "function"))
	) {
		return;
	}
	const signal: unknown = Reflect.get(options, "signal");

	return signal instanceof AbortSignal ? signal : void 0;
};

// Aborts the contexts of one emit with the outside signal, for as long as the emit has work left.
const follow = (
	signal: AbortSignal,
	linked: Linked,
	event: unknown,
	result: unknown,
) => {
	const unlink = onAbort({ signal }, (reason) => {
		for (const { target } of linked) {
			(target as Abortable).abort(reason);
		}
	});
	// a command that finished has nothing left to abort; an event keeps its link
	if (isPromise(result)) {
		result.then(unlink, unlink);
	} else if (commandOf(event)) {
		unlink();
	}

	return result;
};

/**
 * Lets `bus.emit(call, { signal })` tie the tasks that this emit starts to an
 * outside `AbortSignal`: when it aborts, their `ctx.signal` aborts with the same
 * reason, so a handler, `latest`, `retry` and `timeout` stop as for any abort. It
 * is made for libraries that own the request and give you a signal, such as the
 * `queryFn` of React Query. The tasks that count are those made while the call
 * to `emit` runs (the command or job and the listeners of its type, and their
 * `ctx.run` children); a separate `emit` that a handler makes later is not
 * linked. `emit` returns what it returns without the plugin.
 *
 * For a command or a job the link ends when its promise settles; a handler
 * that returns without a promise is finished with the call, so it is not
 * linked after it. For an event the link stays until the signal aborts, so
 * give each request its own signal.
 *
 * `{ signal }` can share the object with the fields of a scope (see
 * `scopePlugin`); `signal` is never put on `ctx` by a scope. Without this
 * plugin the signal is ignored. Returns the same bus, typed with the new `emit`.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { signalPlugin } from "nanoeffects/signal";
 *
 * const bus = createBus().use(signalPlugin()); // emit takes a signal now
 *
 * // React Query aborts `signal` when the component unmounts or the key changes
 * const queryFn = ({ signal }: { signal: AbortSignal }) =>
 *   bus.emit(getUser("1"), { signal });
 * ```
 */
export const signalPlugin =
	() =>
	<E extends EventMap>(bus: Bus<E>): SignalBus<E> => {
		// the contexts made by the emit that has a signal and is running now
		let current: Linked | undefined;
		let currentSignal: AbortSignal | undefined;

		const previous = bus.addContext;
		bus.addContext = (target) => {
			previous?.(target);
			current?.push({ target });
			// a signal that is aborted already stops the task before its handler runs
			if (currentSignal?.aborted) {
				(target as Abortable).abort(currentSignal.reason);
			}
		};

		const emit = bus.emit as Emitter;
		const withSignal: Emitter = (event, ...rest) => {
			const signal = signalOf(event, rest);
			// a nested emit without a signal is not a task of the emit that is running
			if (!(signal || current)) {
				return emit(event, ...rest);
			}

			const outer = current;
			const outerSignal = currentSignal;
			const linked: Linked = [];
			current = signal ? linked : void 0;
			currentSignal = signal;
			let result: unknown;
			try {
				result = emit(event, ...rest);
			} finally {
				current = outer;
				currentSignal = outerSignal;
			}

			return signal ? follow(signal, linked, event, result) : result;
		};
		bus.emit = withSignal as SignalEmit<E>;

		return bus as SignalBus<E>;
	};
