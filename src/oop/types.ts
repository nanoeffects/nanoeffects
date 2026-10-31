import type { ActionCreator } from "../core/action-creator";
import type { Command } from "../core/bus";

// the parts of a bus that are not methods of an instance: data and hooks for the plugins
type Slots =
	| "ctx"
	| "actions"
	| "trace"
	| "addContext"
	| "applyScope"
	| "fitScope"
	| "app"
	| "use";

type AnyFunction = (...args: never[]) => unknown;

/**
 * The methods an instance of a class from `extendBus` gets: the function
 * members of the bus (`on`, `once`, `off`, `emit`, and those of the plugins used
 * before `extendBus`), `dispose`, and the bus itself as `bus`. A member of the
 * class with the same name is kept and not replaced.
 */
export type BusMethods<B> = {
	[K in keyof B as K extends Slots
		? never
		: B[K] extends AnyFunction
			? K
			: never]: B[K];
} & {
	/** Removes every subscription made through `on` and `once` of this instance. */
	dispose(): void;
	[Symbol.dispose](): void;
	readonly bus: B;
};

/** Any class that `extendBus` can extend. */
export type Constructor = new (...args: never[]) => object;

/**
 * The class `extendBus` returns: it takes the arguments of `C`, its instances
 * are instances of `C` with the methods of `B` that `C` does not have, and its
 * static members are those of `C` plus the bus.
 */
export type Extended<C extends Constructor, B> = {
	new (
		...args: ConstructorParameters<C>
	): InstanceType<C> & Omit<BusMethods<B>, keyof InstanceType<C>>;
	readonly bus: B;
	readonly prototype: InstanceType<C>;
} & Omit<C, "prototype">;

/** A wrapper for the handler of `@On` and `@Once`, such as `latest`. */
export type Wrap = (
	handler: (payload: unknown, ctx: unknown) => unknown,
) => unknown;

type Handler<P> = (payload: P, ctx: never) => unknown;

/**
 * What `@On(event)` and `@Once(event)` return: a method decorator of the
 * language and of `experimentalDecorators`. The payload of the method is
 * checked against the event when the event is an action creator or a command.
 */
export interface MethodDecorator<P> {
	(value: Handler<P>, context: ClassMethodDecoratorContext): void;
	(
		target: object,
		key: string | symbol,
		descriptor: TypedPropertyDescriptor<Handler<P>>,
	): void;
}

/** The events a decorator takes. */
export type EventOf<P> = ActionCreator<P> | Command<P, unknown>;
