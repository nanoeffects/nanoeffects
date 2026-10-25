import type { Bus } from "../core/bus";
import type { EventMap } from "../core/types";
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

const remember = (event: unknown, wrap: Wrap | undefined, once: boolean) =>
	((...args: unknown[]) => {
		const method = methodOf(args);
		if (typeof method === "function") {
			decorated.set(method, { event, wrap, once });
		}
	}) as MethodDecorator<never>;

/**
 * Makes a method of a class from `extendBus` or `@WithBus` a handler of `event`
 * for each instance, with `this` bound to the instance, from the construction
 * until `dispose()`. `wrap` takes the bound handler and returns the one to
 * subscribe, such as `latest`. An event emitted inside the constructor of the
 * base class does not reach it: the subscription is made right after.
 *
 * @example
 * ```ts
 * class SearchServiceBase {
 *   @On(queryChanged, latest) // a new query aborts the one before it
 *   async search(query: string, { signal }: Context) {}
 * }
 * ```
 */
export function On<P>(event: EventOf<P>, wrap?: Wrap): MethodDecorator<P>;
export function On(event: string, wrap?: Wrap): MethodDecorator<never>;
export function On(event: unknown, wrap?: Wrap): unknown {
	return remember(event, wrap, false);
}

/** Like `On`, but the handler runs at most once for an instance. */
export function Once<P>(event: EventOf<P>, wrap?: Wrap): MethodDecorator<P>;
export function Once(event: string, wrap?: Wrap): MethodDecorator<never>;
export function Once(event: unknown, wrap?: Wrap): unknown {
	return remember(event, wrap, true);
}
