// What `tracePlugin` knows about the listeners of a bus, for `off` and for `describeBus`.
// The bus holds the listeners, so a bus that is collected takes this along.

export type Handler = (payload: unknown, ctx: never) => unknown;

/** `handler` is what the app passed, `wrapper` is what the bus holds, `name` is what the trace shows. */
export type Entry = {
	handler: Handler;
	wrapper: Handler;
	name: string | undefined;
	/** Where it was registered, with `tracePlugin({ source: true })`. */
	source?: string | undefined;
};

export type Listeners = Map<unknown, Entry[]>;

const registries = new WeakMap<object, Listeners>();

export const listenersOf = (bus: object): Listeners => {
	const known = registries.get(bus);
	if (known) {
		return known;
	}
	const listeners: Listeners = new Map();
	registries.set(bus, listeners);

	return listeners;
};

export const peekListeners = (bus: object) => registries.get(bus);

export const add = (listeners: Listeners, key: unknown, entry: Entry) => {
	const list = listeners.get(key) ?? [];
	list.push(entry);
	listeners.set(key, list);
};

export const drop = (listeners: Listeners, key: unknown, entry: Entry) => {
	const list = listeners.get(key);
	const index = list?.indexOf(entry) ?? -1;
	if (!list || index < 0) {
		return;
	}
	list.splice(index, 1);
	if (list.length === 0) {
		listeners.delete(key);
	}
};

/** The last listener that was added with `handler`, as `off(event, handler)` removes one registration. */
export const lastOf = (
	listeners: Listeners,
	key: unknown,
	handler: Handler,
) => {
	const list = listeners.get(key) ?? [];

	return list.findLast((entry) => entry.handler === handler);
};
