import { type Bus, createBus } from "../core/bus";
import type { EventMap } from "../core/types";
import { decoratedOf } from "./registry";
import { disposeBus, subscribe, unsubscribe } from "./subscriptions";
import type { Constructor, Extended } from "./types";

// what the instance does not get as a forwarding method: its own versions of the first four, and data and hooks for the plugins
const slots = new Set([
	"on",
	"once",
	"off",
	"emit",
	"ctx",
	"commands",
	"trace",
	"addContext",
	"applyScope",
	"fitScope",
	"app",
	"use",
]);

// `Symbol.dispose` is missing on old runtimes: the class then has `dispose` only
const disposeSymbol: symbol | undefined = Reflect.get(Symbol, "dispose");

const isConstructor = (value: unknown): value is Constructor =>
	typeof value === "function";

// defines a member of the prototype unless the class (or one it extends) has it
const define = (
	prototype: object,
	base: object,
	key: string | symbol,
	descriptor: PropertyDescriptor,
) => {
	if (!(key in base)) {
		Object.defineProperty(prototype, key, {
			configurable: true,
			enumerable: false,
			...descriptor,
		});
	}
};

type Method = (...args: unknown[]) => unknown;

// `on`, `once` and `off` of one instance, made at the first use and kept
const bound = new WeakMap<object, Record<"on" | "once" | "off", Method>>();

const methodsOf = (instance: object, bus: object) => {
	const known = bound.get(instance);
	if (known) {
		return known;
	}
	const made = {
		on: (...args: unknown[]) => subscribe(instance, bus, "on", args),
		once: (...args: unknown[]) => subscribe(instance, bus, "once", args),
		off: (...args: unknown[]) => unsubscribe(instance, bus, args),
	};
	bound.set(instance, made);

	return made;
};

// a function of the bus, looked up at each call so a wrapper put on the bus later is used
const forwarding =
	(bus: object, name: string): Method =>
	(...args) =>
		Reflect.apply(Reflect.get(bus, name), bus, args);

// subscribes the methods that `@On` and `@Once` marked, for an instance that was just built
const subscribeMethods = (instance: object, bus: object) => {
	for (const { method, spec } of decoratedOf(
		Reflect.getPrototypeOf(instance) ?? {},
	)) {
		const handler = (payload: unknown, ctx: unknown) =>
			Reflect.apply(method, instance, [payload, ctx]);
		const given = spec.wrap ? spec.wrap(handler) : handler;
		subscribe(instance, bus, spec.once ? "once" : "on", [spec.event, given]);
	}
};

const addMethods = (prototype: object, base: object, bus: object) => {
	for (const name of ["on", "once", "off"] as const) {
		define(prototype, base, name, {
			get(this: object) {
				return methodsOf(this, bus)[name];
			},
		});
	}
	define(prototype, base, "emit", { value: forwarding(bus, "emit") });
	// the methods the plugins added before now; the ones added later are not seen
	for (const [name, value] of Object.entries(bus)) {
		if (typeof value === "function" && !slots.has(name)) {
			define(prototype, base, name, { value: forwarding(bus, name) });
		}
	}
	const dispose = function (this: object) {
		disposeBus(this);
	};
	define(prototype, base, "dispose", { value: dispose });
	if (disposeSymbol) {
		define(prototype, base, disposeSymbol, { value: dispose });
	}
	define(prototype, base, "bus", { get: () => bus });
};

const extend = (bus: object, Base: Constructor): unknown => {
	const Class = function (this: unknown, ...args: unknown[]) {
		const instance = Reflect.construct(Base, args, new.target ?? Class);
		subscribeMethods(instance, bus);

		return instance;
	};
	Object.setPrototypeOf(Class, Base);
	Class.prototype = Object.create(Base.prototype, {
		constructor: { value: Class, writable: true, configurable: true },
	});
	Object.defineProperty(Class, "name", {
		value: Base.name,
		configurable: true,
	});
	if (!("bus" in Base)) {
		Object.defineProperty(Class, "bus", { value: bus, configurable: true });
	}
	addMethods(Class.prototype, Base.prototype, bus);

	return Class;
};

/**
 * Makes a class from `Base` whose instances have the methods of a bus, with the
 * subscriptions made through an instance ended by `dispose()`. `new Extended(…)`
 * runs the constructor of `Base`; the class has the name of `Base`, and its
 * instances are instances of `Base`. The members of `Base` win: a method called
 * `emit` or `dispose` in `Base` is kept, and `disposeBus(this)` ends the
 * subscriptions from there.
 *
 * Without a bus, `extendBus(Base)` makes one for the class (`Extended.bus`),
 * shared by its instances. The methods of the plugins used on `bus` before this
 * call are on the instances too; the ones of plugins used later are not.
 *
 * @example
 * ```ts
 * class SearchServiceBase {
 *   constructor(private api: Api) {
 *     this.on("query/changed", (query) => this.load(query)); // ends with dispose()
 *   }
 *   load(query: string) {}
 * }
 *
 * export const SearchService = extendBus(bus, SearchServiceBase);
 * const service = new SearchService(api);
 * service.dispose(); // its subscriptions are gone
 * ```
 */
export function extendBus<C extends Constructor>(
	Base: C,
): Extended<C, Bus<EventMap>>;
export function extendBus<B extends object, C extends Constructor>(
	bus: B,
	Base: C,
): Extended<C, B>;
export function extendBus(first: object, second?: Constructor): unknown {
	if (isConstructor(first)) {
		return extend(createBus(), first);
	}
	if (!second) {
		throw new TypeError("extendBus: pass the class to extend");
	}

	return extend(first, second);
}
