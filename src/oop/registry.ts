import type { ListenerOptions } from "../core/types";
import type { Wrap } from "./types";

// what `@On` and `@Once` remember about a method; the key is the function of the method
export type Spec = {
	event: unknown;
	wrap: Wrap | undefined;
	once: boolean;
	// `{ traceId }`, given on to `on` and `once` of the instance
	options: ListenerOptions | undefined;
};

export const decorated = new WeakMap<object, Spec>();

type Found = {
	key: string | symbol;
	method: (...args: never[]) => unknown;
	spec: Spec;
};

const isMethod = (value: unknown): value is (...args: never[]) => unknown =>
	typeof value === "function";

const methodsOf = (prototype: object) =>
	Reflect.ownKeys(prototype).flatMap((key) => {
		const value = Reflect.getOwnPropertyDescriptor(prototype, key)?.value;

		return isMethod(value) ? [{ key, value }] : [];
	});

const found = new WeakMap<object, Found[]>();

/**
 * The decorated methods an instance has, found once for a prototype. The most
 * derived definition of a name decides: an override that is not decorated hides
 * the decorated method it overrides.
 */
export const decoratedOf = (prototype: object): Found[] => {
	const known = found.get(prototype);
	if (known) {
		return known;
	}

	const seen = new Set<string | symbol>();
	const list: Found[] = [];
	for (
		let current: object | null = prototype;
		current && current !== Object.prototype;
		current = Reflect.getPrototypeOf(current)
	) {
		for (const { key, value } of methodsOf(current)) {
			if (key === "constructor" || seen.has(key)) {
				continue;
			}
			seen.add(key);
			const spec = decorated.get(value);
			if (spec) {
				list.push({ key, method: value, spec });
			}
		}
	}
	found.set(prototype, list);

	return list;
};
