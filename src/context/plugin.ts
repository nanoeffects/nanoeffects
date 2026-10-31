import type { Bus, WithContext } from "../core/bus";
import type { ContextTask, NoClash, Resolved } from "../core/context-types";
import { signalFieldKey } from "../core/signal-field-key";
import type { EventMap } from "../core/types";

const isFactory = <Fields extends object>(
	fields: Fields | ((task: ContextTask) => Fields),
): fields is (task: ContextTask) => Fields => typeof fields === "function";

const taskOf = (ctx: object): ContextTask => ({
	type: Reflect.get(ctx, "type"),
	payload: Reflect.get(ctx, "payload"),
});

type Maker = (signal: AbortSignal) => unknown;

// the function a `fromSignal` field carries, if the value is one
const makerOf = (value: unknown): Maker | undefined => {
	if (typeof value !== "object" || value === null) {
		return;
	}

	return Reflect.get(value, signalFieldKey);
};

// A field that is made at its first read from the signal of this task. It is not enumerable, so
// the context of a child task (`ctx.run` spreads its parent) and a logger do not read it, and the
// child defines its own, with its own signal. The descriptor is shared by every task, as the getter
// takes its task from `this`.
const lazyOf = (key: string, make: Maker): PropertyDescriptor => ({
	configurable: true,
	get(this: object) {
		const value = make(Reflect.get(this, "signal"));
		Object.defineProperty(this, key, {
			configurable: true,
			writable: true,
			value,
		});

		return value;
	},
});

// the descriptor of each marker, so a task makes none; the key is kept in case a marker is used under two names
const lazies = new WeakMap<object, { key: string; lazy: PropertyDescriptor }>();

// the getter for a `fromSignal` field; nothing for any other value
const lazyFor = (key: string, value: unknown) => {
	const make = makerOf(value);
	if (!(make && typeof value === "object" && value !== null)) {
		return;
	}
	const known = lazies.get(value);
	if (known?.key === key) {
		return known.lazy;
	}
	const lazy = lazyOf(key, make);
	lazies.set(value, { key, lazy });

	return lazy;
};

/**
 * Puts `fields` on the context of every task of the bus: a store, a client, a
 * logger. The types come from the value, so the event map needs no
 * `WithContext`. Returns the same bus, typed with the fields. A function gets
 * `{ type, payload }` of the task and returns its fields.
 *
 * Several uses merge with each other, with the `context` option of `createBus`
 * and with `effectsPlugin`. A name that the bus already has is a type error. The
 * fields of the library (`signal`, `emit`, `run`, …) win, and a field that the
 * context already has is not replaced.
 *
 * A field made with `fromSignal` from `nanoeffects/signal` is built from the signal
 * of each task, when the task first reads it, so a client or a handle that needs a
 * signal is declared once. A child task (`ctx.run`) builds its own. It is not
 * copied by `{ ...ctx }`.
 *
 * @example
 * ```ts
 * type Events = { "user/loaded": User };
 *
 * const bus = createBus<Events>().use(contextPlugin({ store }));
 * bus.on("user/loaded", (user, { store }) => store.put(user)); // ctx.store: Store
 * ```
 */
export const contextPlugin =
	<Fields extends object>(fields: Fields | ((task: ContextTask) => Fields)) =>
	<E extends EventMap>(
		bus: Bus<E> & NoClash<Fields, E>,
	): Bus<E & WithContext<Resolved<Fields>>> => {
		const previous = bus.addContext;

		bus.addContext = (ctx) => {
			previous?.(ctx);
			const own = isFactory(fields) ? fields(taskOf(ctx)) : fields;
			for (const [key, value] of Object.entries(own)) {
				if (key in ctx) {
					continue;
				}
				const lazy = lazyFor(key, value);
				if (lazy) {
					Object.defineProperty(ctx, key, lazy);
				} else {
					Reflect.set(ctx, key, value);
				}
			}
		};

		return bus as Bus<E & WithContext<Resolved<Fields>>>;
	};
