import type { Bus } from "../core/bus";
import type { EventMap } from "../core/types";

// any function of the bus: its calls go through `Reflect.apply`, so the parameters need no type
type Method = (...args: never[]) => unknown;

// one call of `on`, `once` or `off` that waits for the replay
type Held = {
	kind: "on" | "once" | "off";
	args: unknown[];
	dropped: boolean;
	// the unsubscribe function of the real subscription, once it is made
	live?: (() => void) | undefined;
};

const isObject = (value: unknown): value is object =>
	typeof value === "object" && value !== null;

// The event a call is for: an action creator and a command are known by their string `type`, a predicate by itself.
const eventOf = (event: unknown) => {
	if (typeof event === "string") {
		return event;
	}
	if (isObject(event) || typeof event === "function") {
		const type = Reflect.get(event, "type");
		return typeof type === "string" ? type : event;
	}

	return event;
};

// Whether a held `off(event, fn?)` removes a held `on(event, fn)`.
const removes = (off: unknown[], held: unknown[]) => {
	const [event, handler] = off;
	if (event === void 0) {
		return true;
	}

	return (
		Object.is(eventOf(event), eventOf(held[0])) &&
		(handler === void 0 || Object.is(handler, held[1]))
	);
};

/**
 * Holds the `on`, `once` and `off` calls of a bus until `release()`, then
 * replays them, in the order made, with `replay()`. `modulePlugin` uses it to
 * mount its modules late and still keep their listeners ahead of the ones that
 * were registered after the plugin was used.
 *
 * The function an `on` returns removes the subscription whether it was made yet
 * or not.
 */
export const holdListeners = <E extends EventMap>(bus: Bus<E>) => {
	const original = { on: bus.on, once: bus.once, off: bus.off };
	const queue: Held[] = [];
	let holding = true;

	const call = (method: Method, args: unknown[]) =>
		Reflect.apply(method, bus, args);

	const subscribing =
		(kind: "on" | "once", method: Method) =>
		(...args: unknown[]) => {
			if (!holding) {
				return call(method, args);
			}
			const entry: Held = { kind, args, dropped: false };
			queue.push(entry);

			return () => {
				if (entry.live) {
					entry.live();
				} else {
					entry.dropped = true;
				}
			};
		};

	const unsubscribing =
		(method: Method) =>
		(...args: unknown[]) => {
			if (!holding) {
				return call(method, args);
			}
			for (const entry of queue) {
				if (entry.kind !== "off" && removes(args, entry.args)) {
					entry.dropped = true;
				}
			}
			// it may also remove a listener that was there before the hold
			queue.push({ kind: "off", args, dropped: false });
		};

	const on = subscribing("on", original.on);
	const once = subscribing("once", original.once);
	const off = unsubscribing(original.off);
	bus.on = on as typeof bus.on;
	bus.once = once as typeof bus.once;
	bus.off = off as typeof bus.off;

	return {
		/** Calls go through again; a wrapper that something put on top since stays and passes them down. */
		release: () => {
			holding = false;
			if (bus.on === on) {
				bus.on = original.on;
			}
			if (bus.once === once) {
				bus.once = original.once;
			}
			if (bus.off === off) {
				bus.off = original.off;
			}
		},
		/** Makes the held subscriptions, in order. */
		replay: () => {
			for (const entry of queue.splice(0)) {
				if (entry.dropped) {
					continue;
				}
				if (entry.kind === "off") {
					call(original.off, entry.args);
				} else {
					const method = entry.kind === "on" ? original.on : original.once;
					entry.live = call(method, entry.args) as () => void;
				}
			}
		},
	};
};
