// What an instance subscribed to, kept outside the instance: `this.on` is called in the
// constructor of the base class, before the fields of a subclass exist.
type Entry = { event: unknown; handler: unknown; off: () => void };

const held = new WeakMap<object, Set<Entry>>();

const isObject = (value: unknown): value is object =>
	(typeof value === "object" && value !== null) || typeof value === "function";

const entriesOf = (instance: object) => {
	const known = held.get(instance);
	if (known) {
		return known;
	}
	const made = new Set<Entry>();
	held.set(instance, made);

	return made;
};

// An action creator and a command are known by their string `type`, a predicate by itself.
const eventKey = (event: unknown) => {
	if (typeof event === "string") {
		return event;
	}
	if (isObject(event)) {
		const type = Reflect.get(event, "type");
		return typeof type === "string" ? type : event;
	}

	return event;
};

const call = (bus: object, name: string, args: unknown[]) =>
	Reflect.apply(Reflect.get(bus, name), bus, args);

/** `on` or `once` of the bus for an instance: the subscription is remembered, and ended with the instance. */
export const subscribe = (
	instance: object,
	bus: object,
	kind: "on" | "once",
	args: unknown[],
): (() => void) => {
	const [event, handler, ...rest] = args;
	const entries = entriesOf(instance);
	const entry: Entry = { event, handler, off: () => {} };
	// a handler that fired once is not held any more
	const fired = (payload: unknown, ctx: unknown) => {
		entries.delete(entry);
		return typeof handler === "function"
			? Reflect.apply(handler, null, [payload, ctx])
			: void 0;
	};
	const given = kind === "once" ? fired : handler;
	const made = call(bus, kind, [event, given, ...rest]);
	const off = typeof made === "function" ? () => made() : () => {};
	entry.off = off;
	entries.add(entry);

	return () => {
		entries.delete(entry);
		off();
	};
};

/** `off` of the bus for an instance: it also forgets the subscriptions of the instance it removes. */
export const unsubscribe = (instance: object, bus: object, args: unknown[]) => {
	const [event, handler] = args;
	const entries = entriesOf(instance);
	if (event === void 0) {
		entries.clear();
	}
	for (const entry of [...entries]) {
		const sameEvent = Object.is(eventKey(entry.event), eventKey(event));
		if (sameEvent && (handler === void 0 || entry.handler === handler)) {
			entries.delete(entry);
			entry.off();
		}
	}

	return call(bus, "off", args);
};

/**
 * Removes every subscription an instance made through `on` and `once`, and does
 * nothing for any other value. A class with a `dispose` of its own calls it from
 * there.
 *
 * @example
 * ```ts
 * class SearchService {
 *   dispose() {
 *     disposeBus(this); // the subscriptions of this instance are removed
 *   }
 * }
 * ```
 */
export const disposeBus = (instance: unknown): void => {
	if (!isObject(instance)) {
		return;
	}
	const entries = held.get(instance);
	if (!entries) {
		return;
	}
	held.delete(instance);
	for (const entry of entries) {
		entry.off();
	}
};
