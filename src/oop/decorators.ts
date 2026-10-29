import type { Bus } from "../core/bus";
import type { EventMap, ListenerOptions } from "../core/types";
import { extendBus } from "./extend";
import { decorated } from "./registry";
import type {
	Constructor,
	EventOf,
	Extended,
	MethodDecorator,
	Wrap,
} from "./types";

/**
 * A class decorator that does what `extendBus` does: `@WithBus(bus) class A {}`
 * replaces `A` by `extendBus(bus, A)`, and `@WithBus() class A {}` by
 * `extendBus(A)`. It works for the decorators of the language and for
 * `experimentalDecorators`. TypeScript does not change the type of a decorated
 * class, so declare what it gets next to it:
 * `interface A extends BusMethods<typeof bus> {}`.
 *
 * @example
 * ```ts
 * interface SearchService extends BusMethods<typeof bus> {}
 *
 * @WithBus(bus)
 * class SearchService {}
 * ```
 */
export function WithBus<B extends object>(
	bus: B,
): <C extends Constructor>(Base: C) => Extended<C, B>;
export function WithBus(): <C extends Constructor>(
	Base: C,
) => Extended<C, Bus<EventMap>>;
export function WithBus(bus?: object) {
	return (Base: Constructor): unknown =>
		bus ? extendBus(bus, Base) : extendBus(Base);
}

// the function of the method, from the arguments of a decorator of either kind
const methodOf = (args: unknown[]) => {
	const [target, key, descriptor] = args;
	if (typeof key === "string" || typeof key === "symbol") {
		// experimentalDecorators: (target, key, descriptor)
		return Reflect.get(Object(descriptor), "value");
	}

	return target;
};

// the second argument of a decorator is a wrapper (a function), or the options (an object)
const remember = (
	event: unknown,
	second: Wrap | ListenerOptions | undefined,
	third: ListenerOptions | undefined,
	once: boolean,
) =>
	((...args: unknown[]) => {
		const method = methodOf(args);
		if (typeof method === "function") {
			const wrap = typeof second === "function" ? second : void 0;
			const options = typeof second === "function" ? third : (second ?? third);
			decorated.set(method, { event, wrap, once, options });
		}
	}) as MethodDecorator<never>;

/**
 * Makes a method of a class from `extendBus` or `@WithBus` a handler of `event`
 * for each instance, with `this` bound to the instance, from the construction
 * until `dispose()`. `wrap` takes the bound handler and returns the one to
 * subscribe, such as `latest`. `{ traceId }`, as the second or the third
 * argument, names the method in the trace (see `tracePlugin`). An event emitted
 * inside the constructor of the base class does not reach it: the
 * subscription is made right after.
 *
 * @example
 * ```ts
 * class SearchServiceBase {
 *   @On(queryChanged, latest) // a new query aborts the one before it
 *   async search(query: string, { signal }: Context) {}
 * }
 * ```
 */
export function On<P>(
	event: EventOf<P>,
	wrap?: Wrap,
	options?: ListenerOptions,
): MethodDecorator<P>;
export function On<P>(
	event: EventOf<P>,
	options: ListenerOptions,
): MethodDecorator<P>;
export function On(
	event: string,
	wrap?: Wrap,
	options?: ListenerOptions,
): MethodDecorator<never>;
export function On(
	event: string,
	options: ListenerOptions,
): MethodDecorator<never>;
export function On(
	event: unknown,
	second?: Wrap | ListenerOptions,
	third?: ListenerOptions,
): unknown {
	return remember(event, second, third, false);
}

/** Like `On`, but the handler runs at most once for an instance. */
export function Once<P>(
	event: EventOf<P>,
	wrap?: Wrap,
	options?: ListenerOptions,
): MethodDecorator<P>;
export function Once<P>(
	event: EventOf<P>,
	options: ListenerOptions,
): MethodDecorator<P>;
export function Once(
	event: string,
	wrap?: Wrap,
	options?: ListenerOptions,
): MethodDecorator<never>;
export function Once(
	event: string,
	options: ListenerOptions,
): MethodDecorator<never>;
export function Once(
	event: unknown,
	second?: Wrap | ListenerOptions,
	third?: ListenerOptions,
): unknown {
	return remember(event, second, third, true);
}
