import type { Bus, EventLike } from "../core/bus";
import { renameTask, traceRun } from "../core/context";
import { TRACE } from "../core/flag";
import { type Origin, originKey } from "../core/origin-key";
import { withCall } from "../core/trace-call";
import type { EventMap } from "../core/types";
import { emitFrom } from "./origin";

type Emitter = (event: unknown, ...rest: unknown[]) => unknown;
type Handler = (payload: unknown, ctx: never) => unknown;
type Subscribe = (
	event: unknown,
	fn: Handler,
	...rest: unknown[]
) => () => void;
type Unsubscribe = (event?: unknown, fn?: Handler) => void;

// the handlers that were registered with a name, by handler and by event, to find the wrapper again for `off`
type Wrappers = WeakMap<Handler, Map<unknown, Handler[]>>;

const keyOf = (event: unknown) =>
	typeof event === "string" ? event : Reflect.get(Object(event), "type");

/**
 * Names and groups what the trace shows, on a bus that has a tracer:
 *
 * - `traceGroupId` in the scope of a command, a job or an action goes to every
 *   task that the call starts;
 * - `useEmitter` and `bus.emitter` emit from a root task named by their
 *   `traceId`, so a chain says which subscription began it;
 * - `bus.on(event, handler, { traceId })` and `once` name a listener: each call of
 *   it is a task with that `traceId`, and what it emits is below it.
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
	() =>
	<E extends EventMap>(bus: Bus<E>): Bus<E> => {
		if (!(TRACE && bus.trace)) {
			return bus;
		}

		// the call that is being emitted is known to the tracer for the time of the emit
		const emit = bus.emit as Emitter;
		const withKnownCall: Emitter = (event, ...rest) => {
			const run = () => emit(event, ...rest);

			return withCall(event, run);
		};
		bus.emit = withKnownCall as Bus<E>["emit"];

		// the root of an emitter: `useEmitter` and `bus.emitter` find it by this key
		const origin: Origin = (action, options) => {
			const given = action as EventLike<E>;
			emitFrom(bus, given, options);
		};
		Reflect.set(bus, originKey, origin);

		const wrappers: Wrappers = new WeakMap();
		const remember = (event: unknown, fn: Handler, wrapper: Handler) => {
			const byEvent = wrappers.get(fn) ?? new Map<unknown, Handler[]>();
			const key = keyOf(event);
			byEvent.set(key, [...(byEvent.get(key) ?? []), wrapper]);
			wrappers.set(fn, byEvent);
		};
		const forget = (event: unknown, fn: Handler) => {
			const list = wrappers.get(fn)?.get(keyOf(event));

			return list?.pop();
		};

		// the task of the listener is the one that is named, so what it emits is below it
		const named =
			(fn: Handler, traceId: string): Handler =>
			(payload, ctx) => {
				renameTask(ctx, traceId);
				return traceRun(ctx, "run", () => fn(payload, ctx));
			};

		const subscribe = (method: Subscribe, once: boolean) => {
			const wrapped: Subscribe = (event, fn, options) => {
				const traceId = Reflect.get(Object(options), "traceId");
				if (typeof traceId !== "string") {
					return method(event, fn);
				}

				const wrapper: Handler = once
					? (payload, ctx) => {
							forget(event, fn);
							return named(fn, traceId)(payload, ctx);
						}
					: named(fn, traceId);
				remember(event, fn, wrapper);
				const off = method(event, wrapper);

				return () => {
					off();
				};
			};

			return wrapped;
		};

		const off = bus.off as Unsubscribe;
		const unsubscribe: Unsubscribe = (event, fn) => {
			if (fn === void 0) {
				off(event);
				return;
			}
			off(event, forget(event, fn) ?? fn);
		};

		const on = bus.on as Subscribe;
		const once = bus.once as Subscribe;
		bus.on = subscribe(on, false) as Bus<E>["on"];
		bus.once = subscribe(once, true) as Bus<E>["once"];
		bus.off = unsubscribe as Bus<E>["off"];

		return bus;
	};
