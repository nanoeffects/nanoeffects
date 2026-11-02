import type { Bus, EventLike } from "../core/bus";
import { currentEmitter, renameTask, traceRun } from "../core/context";
import { TRACE } from "../core/flag";
import { type Origin, originKey } from "../core/origin-key";
import { withCall } from "../core/trace-call";
import type { EventMap } from "../core/types";
import { takeCaller, wantCaller, withCaller } from "../utils";
import {
	add,
	drop,
	type Entry,
	type Handler,
	lastOf,
	listenersOf,
} from "./listeners";
import { emitFrom } from "./origin";
import { sourceFrom } from "./source";

type Emitter = (event: unknown, ...rest: unknown[]) => unknown;
type Subscribe = (
	event: unknown,
	fn: Handler,
	...rest: unknown[]
) => () => void;
type Unsubscribe = (event?: unknown, fn?: Handler) => void;

const keyOf = (event: unknown) =>
	typeof event === "string" ? event : Reflect.get(Object(event), "type");

// the payload as `emit` reads it: inside an action, or the second argument
const payloadOf = (event: unknown, rest: unknown[]) =>
	typeof event === "object" ? Reflect.get(Object(event), "payload") : rest[0];

export type TracePluginOptions = {
	/**
	 * Record where each `bus.on` and `bus.once` was called (`file:line:column`) and put it on the
	 * events of the listener. Reads one stack at registration, never on emit. An anonymous listener
	 * is reported too, under the type of its event. Default `false`.
	 */
	source?: boolean;
};

/**
 * Names and groups what the trace shows, on a bus that has a tracer:
 *
 * - `traceGroupId` in the scope of an action, a job or an action goes to every
 *   task that the call starts;
 * - `useEmitter` and `bus.emitter` emit from a root task named by their
 *   `traceId`, so a chain says which subscription began it;
 * - `bus.on(event, handler, { traceId })` and `once` name a listener: each call of
 *   it is a task with that `traceId`, and what it emits is below it;
 * - each emit is reported as one event with `effect: "emit"`, also when nothing
 *   listens to it, so a log can show what was emitted and not only what ran.
 *
 * The plugin does nothing on a bus without a tracer, and without it all of these
 * options are ignored, so a project can leave it out, or use it only in
 * development, and nothing else changes. Returns the same bus.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";
 *
 * const bus = createBus({ trace: createTracer(consoleLogger()) }).use(tracePlugin());
 *
 * // a listener that you can find in the log
 * bus.on("name/changed", saveName, { traceId: "saveNotifier" });
 * ```
 */
export const tracePlugin =
	(options: TracePluginOptions = {}) =>
	<E extends EventMap>(bus: Bus<E>): Bus<E> => {
		if (!(TRACE && bus.trace)) {
			return bus;
		}

		// the emit is a leaf task of the tracer, with no context of its own (no signal to make or link),
		// so no other task changes its parent or root
		const { trace } = bus;
		const report = (event: unknown, rest: unknown[]) => {
			const ref = trace.task(
				{ type: keyOf(event), payload: payloadOf(event, rest), leaf: true },
				currentEmitter(),
			);
			trace.report(ref, "emit", "done");
		};

		// the call that is being emitted is known to the tracer for the time of the emit
		const emit = bus.emit as Emitter;
		const withKnownCall: Emitter = (event, ...rest) => {
			const run = () => {
				report(event, rest);

				return emit(event, ...rest);
			};

			return withCall(event, run);
		};
		bus.emit = withKnownCall as Bus<E>["emit"];

		// the root of an emitter: `useEmitter` and `bus.emitter` find it by this key
		const origin: Origin = (action, options) => {
			const given = action as EventLike<E>;
			emitFrom(bus, given, options);
		};
		Reflect.set(bus, originKey, origin);

		// what was registered, by event, to find the wrapper again for `off` and to list it for `describeBus`
		const listeners = listenersOf(bus);

		// the task of the listener is the one that is named, so what it emits is below it
		const named =
			(fn: Handler, traceId: string, source?: string): Handler =>
			(payload, ctx) => {
				renameTask(ctx, traceId, source);
				return traceRun(ctx, "run", () => fn(payload, ctx));
			};

		// the `traceId`, else the name of the function; an empty name leaves the task as it is
		const nameOf = (fn: Handler, options: unknown) => {
			const traceId = Reflect.get(Object(options), "traceId");

			return typeof traceId === "string" ? traceId : fn.name || void 0;
		};

		const withSource = options.source === true;
		if (withSource) {
			wantCaller();
		}

		// the name the task shows: given, else (to hold a source) the event the listener handles
		const shownName = (name: string | undefined, key: unknown) => {
			if (name !== void 0 || !withSource) {
				return name;
			}

			return typeof key === "string" ? key : void 0;
		};

		// what the bus holds: the listener, named when it has a name, and leaving the list when it runs once
		const wrapperOf = (entry: Entry, key: unknown, once: boolean) => {
			const shown = shownName(entry.name, key);
			const run =
				typeof shown === "string"
					? named(entry.handler, shown, entry.source)
					: entry.handler;
			if (!once) {
				return run;
			}
			const leaving: Handler = (payload, ctx) => {
				drop(listeners, key, entry);
				return run(payload, ctx);
			};

			return leaving;
		};

		const subscribe = (method: Subscribe, once: boolean) => {
			const register: Subscribe = (event, fn, given) => {
				const key = keyOf(event);
				// the frame after `withCaller` and the wrapper of the outermost method that was called
				const source = withSource ? sourceFrom(takeCaller(), 2) : void 0;
				const entry: Entry = {
					handler: fn,
					wrapper: fn,
					name: nameOf(fn, given),
					source,
				};
				entry.wrapper = wrapperOf(entry, key, once);
				add(listeners, key, entry);
				const off = method(event, entry.wrapper, given);

				return () => {
					drop(listeners, key, entry);
					off();
				};
			};
			// the method of the bus: when it is the outermost, it holds the stack of its caller
			const wrapped: Subscribe = (event, fn, given) => {
				return withCaller(() => register(event, fn, given));
			};

			return wrapped;
		};

		const off = bus.off as Unsubscribe;
		const unsubscribe: Unsubscribe = (event, fn) => {
			if (event === void 0) {
				listeners.clear();
			} else if (fn === void 0) {
				listeners.delete(keyOf(event));
			} else {
				const entry = lastOf(listeners, keyOf(event), fn);
				if (entry) {
					drop(listeners, keyOf(event), entry);
				}
				off(event, entry?.wrapper ?? fn);
				return;
			}
			off(event, fn);
		};

		const on = bus.on as Subscribe;
		const once = bus.once as Subscribe;
		bus.on = subscribe(on, false) as Bus<E>["on"];
		bus.once = subscribe(once, true) as Bus<E>["once"];
		bus.off = unsubscribe as Bus<E>["off"];

		return bus;
	};
