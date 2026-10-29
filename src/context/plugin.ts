import type { Bus, WithContext } from "../core/bus";
import type { ContextTask, NoClash } from "../core/context-types";
import type { EventMap } from "../core/types";

const isFactory = <Fields extends object>(
	fields: Fields | ((task: ContextTask) => Fields),
): fields is (task: ContextTask) => Fields => typeof fields === "function";

const taskOf = (ctx: object): ContextTask => ({
	type: Reflect.get(ctx, "type"),
	payload: Reflect.get(ctx, "payload"),
});

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
	): Bus<E & WithContext<Fields>> => {
		const previous = bus.addContext;

		bus.addContext = (ctx) => {
			previous?.(ctx);
			const own = isFactory(fields) ? fields(taskOf(ctx)) : fields;
			for (const [key, value] of Object.entries(own)) {
				if (!(key in ctx)) {
					Reflect.set(ctx, key, value);
				}
			}
		};

		return bus as Bus<E & WithContext<Fields>>;
	};
