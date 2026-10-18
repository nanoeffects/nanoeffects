import { report } from "./report";

const noop = () => {};

/**
 * Calls `fn` with the abort reason when `ctx.signal` aborts, at most once;
 * at once if it is already aborted. Returns a function that removes the
 * subscription. Does nothing without a signal.
 *
 * @example
 * ```ts
 * bus.on("connect", (url, ctx) => {
 *   const socket = new WebSocket(url);
 *   onAbort(ctx, () => socket.close());
 * });
 * ```
 */
// Every signal gets one real listener and a set of the subscribers of `onAbort`.
// Many subscribers on one signal (a batch of calls under one task) would cost
// time linear in their number with plain listeners, and quadratic in total.
const hubs = new WeakMap<AbortSignal, Set<{ fn: (reason: unknown) => void }>>();

const hubOf = (signal: AbortSignal) => {
	const known = hubs.get(signal);
	if (known) {
		return known;
	}

	const hub = new Set<{ fn: (reason: unknown) => void }>();
	hubs.set(signal, hub);
	signal.addEventListener(
		"abort",
		() => {
			const subscribers = [...hub];
			hub.clear();
			for (const { fn } of subscribers) {
				try {
					fn(signal.reason);
				} catch (error) {
					report("abort callback failed", error);
				}
			}
		},
		{ once: true },
	);

	return hub;
};

export const onAbort = (
	ctx: { signal?: AbortSignal | undefined },
	fn: (reason: unknown) => void,
): (() => void) => {
	const { signal } = ctx;
	if (!signal) {
		return noop;
	}

	if (signal.aborted) {
		fn(signal.reason);
		return noop;
	}

	const hub = hubOf(signal);
	const entry = { fn };
	hub.add(entry);

	return () => {
		hub.delete(entry);
	};
};
