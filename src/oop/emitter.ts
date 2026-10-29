import { type Bus, createBus } from "../core/bus";
import type { EventMap } from "../core/types";
import { disposeSymbol, subscribeMethods } from "./extend";
import { disposeBus, subscribe, unsubscribe } from "./subscriptions";

// the bus of each instance, made at its first use and kept outside it: `this.on` runs in the
// constructor of a parent class, before the fields of a subclass exist
const buses = new WeakMap<object, Bus<EventMap>>();

const busOf = (instance: object): Bus<EventMap> => {
	const known = buses.get(instance);
	if (known) {
		return known;
	}
	const made = createBus();
	buses.set(instance, made);

	return made;
};

type Method = (...args: unknown[]) => unknown;

// what the instance gets as its own, so that they can be taken off it: bound to the instance
const bound = ["on", "once", "off", "emit"] as const;

// binds the most derived `on`, `once`, `off` and `emit`: a method of a subclass is the one that is found
const bindMembers = (instance: object) => {
	for (const name of bound) {
		const method: Method = Reflect.get(instance, name);
		Reflect.set(instance, name, method.bind(instance));
	}
};

/**
 * A base class whose every instance is an independent emitter: it has `on`,
 * `once`, `off`, `emit`, `dispose` and its own `bus`, typed by the event map
 * `E`. Events of one instance never reach another instance. A subscription
 * made through `this.on` or `this.once`, a method decorated with `@On` or
 * `@Once`, and a `Subject` made over `this` all end with `dispose()`.
 *
 * `on`, `once`, `off` and `emit` are bound to the instance, so they can be
 * taken off it (`const { emit } = video`). A subclass replaces one with an
 * arrow property; TypeScript does not let it redeclare one as a method.
 *
 * It has no methods of plugins, because its bus is made inside. For a bus that
 * instances share, or for plugins, use `extendBus(bus)`.
 *
 * @example
 * ```ts
 * type VideoEvents = { "video/time": number };
 *
 * class VideoService extends Emitter<VideoEvents> {
 *   constructor() {
 *     super();
 *     this.on("video/time", (seconds) => console.log(seconds)); // ends with dispose()
 *   }
 * }
 *
 * const video = new VideoService();
 * video.emit("video/time", 12);
 * video.dispose(); // its subscriptions are gone
 * ```
 */
export class Emitter<E extends EventMap = EventMap> {
	declare on: Bus<E>["on"];
	declare once: Bus<E>["once"];
	declare off: Bus<E>["off"];
	declare emit: Bus<E>["emit"];
	declare [Symbol.dispose]: () => void;

	constructor() {
		bindMembers(this);
		// after this, a method decorated with @On or @Once is a handler of this instance
		subscribeMethods(this, busOf(this));
	}

	get bus(): Bus<E> {
		return busOf(this) as Bus<EventMap> as Bus<E>;
	}

	/** Removes every subscription made through `on` and `once` of this instance. */
	dispose(): void {
		disposeBus(this);
	}
}

const members: Record<(typeof bound)[number], Method> = {
	on(this: object, ...args) {
		return subscribe(this, busOf(this), "on", args);
	},
	once(this: object, ...args) {
		return subscribe(this, busOf(this), "once", args);
	},
	off(this: object, ...args) {
		return unsubscribe(this, busOf(this), args);
	},
	emit(this: object, ...args) {
		const bus = busOf(this);

		return Reflect.apply(Reflect.get(bus, "emit"), bus, args);
	},
};

// on the prototype, as writable data, so that the constructor can bind the one that is found
for (const name of bound) {
	Object.defineProperty(Emitter.prototype, name, {
		configurable: true,
		writable: true,
		value: members[name],
	});
}

if (disposeSymbol) {
	Object.defineProperty(Emitter.prototype, disposeSymbol, {
		configurable: true,
		value: function dispose(this: Emitter) {
			this.dispose();
		},
	});
}
