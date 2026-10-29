import type { Action, Bus, EventPayload } from "../core/bus";
import type { EventMap, Task, UnsubscribeCallback } from "../core/types";

/** A function over the action of an event: `{ type, payload }`. */
type Predicate<E extends EventMap> = (action: Action<E>) => boolean;

/** A predicate that is a type guard narrows the payload that the handler gets. */
type Guard<E extends EventMap, A extends Action<E>> = (
	action: Action<E>,
) => action is A;

type MatchOn<E extends EventMap> = {
	<A extends Action<E>>(
		guard: Guard<E, A>,
		fn: Task<A["payload"], E>,
	): UnsubscribeCallback;
	(predicate: Predicate<E>, fn: Task<EventPayload<E>, E>): UnsubscribeCallback;
};

type MatchOff<E extends EventMap> = {
	<A extends Action<E>>(guard: Guard<E, A>, fn?: Task<A["payload"], E>): void;
	(predicate: Predicate<E>, fn?: Task<EventPayload<E>, E>): void;
};

/** What `matchPlugin` adds to `on`, `once` and `off` of the bus: the same methods that also take a predicate. */
export type MatchApi<E extends EventMap> = {
	on: MatchOn<E>;
	once: MatchOn<E>;
	off: MatchOff<E>;
};

type Handler = (payload: unknown, ctx: object) => unknown;
type AnyPredicate = (action: { type: unknown; payload: unknown }) => unknown;

// one subscription of a predicate: the handler it was given, and how to remove it
type Subscription = { handler: Handler; remove: () => void };

// An action creator and a command are functions with a string `type`; a predicate has none.
const isPredicate = (value: unknown): value is AnyPredicate =>
	typeof value === "function" && typeof Reflect.get(value, "type") !== "string";

// The one place where the methods that this file makes are taken for the typed ones of the bus.
const apiOf = <E extends EventMap>(methods: object) => methods as MatchApi<E>;

/**
 * Lets `on`, `once` and `off` of the bus take a predicate as the first argument,
 * to subscribe to the events that it picks instead of to one named event. The
 * predicate gets `{ type, payload }` of every event; when it returns true the
 * handler runs with the payload and the task context of that event. A type guard
 * narrows the payload of the handler. An action creator or a command, which have
 * a string `type`, keep their meaning. Returns the same bus.
 *
 * The subscription listens to `"*"`, so it runs after the listeners of the event
 * itself, makes a task for every event whether or not the predicate accepts it,
 * and counts as a listener for `onUnhandled`. For a few known events,
 * `on(creator, handler)` is cheaper.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { matchPlugin } from "nanoeffects/match";
 *
 * const bus = createBus().use(matchPlugin());
 *
 * // every event of the user domain, with the context of that event
 * bus.on(
 *   (action) => action.type.startsWith("user/"),
 *   (payload, ctx) => console.log(ctx.type, payload),
 * );
 * ```
 */
export const matchPlugin =
	() =>
	<E extends EventMap>(bus: Bus<E>): Bus<E> & MatchApi<E> => {
		// the methods as they are now: the one used last is on top, and this keeps its own calls out of the others
		const { on, once, off } = bus;
		// predicate → its subscriptions, so that `off` can find them
		const subscriptions = new Map<AnyPredicate, Subscription[]>();

		const subscribe = (
			predicate: AnyPredicate,
			handler: Handler,
			single: boolean,
		) => {
			const listener = (payload: unknown, ctx: object) => {
				const type = Reflect.get(ctx, "type");
				if (!predicate({ type, payload })) {
					return;
				}
				if (single) {
					remove();
				}

				return handler(payload, ctx);
			};
			const unbind: UnsubscribeCallback = Reflect.apply(on, bus, [
				"*",
				listener,
			]);
			const record: Subscription = { handler, remove };
			subscriptions.set(predicate, [
				...(subscriptions.get(predicate) ?? []),
				record,
			]);

			function remove() {
				unbind();
				const left = (subscriptions.get(predicate) ?? []).filter(
					(item) => item !== record,
				);
				if (left.length > 0) {
					subscriptions.set(predicate, left);
				} else {
					subscriptions.delete(predicate);
				}
			}

			return remove;
		};

		// the options (`{ traceId }` of `tracePlugin`) are passed on to the method that was on the bus before
		const onWith = (
			first: unknown,
			handler: Handler,
			single: boolean,
			options: unknown,
		) =>
			isPredicate(first)
				? subscribe(first, handler, single)
				: Reflect.apply(single ? once : on, bus, [first, handler, options]);

		const offWith = (first?: unknown, handler?: unknown) => {
			if (handler === void 0 && (first === void 0 || first === "*")) {
				subscriptions.clear();
			}
			if (!isPredicate(first)) {
				return Reflect.apply(off, bus, [first, handler]);
			}
			// `off(predicate, fn)` removes one subscription of that handler, as `off(event, fn)` does
			const records = subscriptions.get(first) ?? [];
			const matching = records.filter((record) => record.handler === handler);
			const targets = handler === void 0 ? records : matching.slice(0, 1);
			for (const record of targets) {
				record.remove();
			}
		};

		return Object.assign(
			bus,
			apiOf<E>({
				on: (first: unknown, handler: Handler, options?: unknown) =>
					onWith(first, handler, false, options),
				once: (first: unknown, handler: Handler, options?: unknown) =>
					onWith(first, handler, true, options),
				off: offWith,
			}),
		);
	};
