import type {
	EventKey,
	EventLike,
	EventPayload,
	Handler,
	WithType,
} from "./bus";
import type { EventMap } from "./types";

export const eventKey = <K extends string>(event: K | WithType<K>): K =>
	typeof event === "string" ? event : event.type;

export const eventPayload = <E extends EventMap>(
	event: EventKey<E> | Handler<E> | EventLike<E>,
	payload?: EventPayload<E>,
): EventPayload<E> => {
	const data = typeof event === "object" ? event.payload : payload;

	return data as EventPayload<E>;
};

/** Duck-typed Promise / thenable check (not `instanceof Promise`). */
export const isPromise = <T>(
	value: T,
): value is T & PromiseLike<Awaited<T>> => {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return typeof (value as { then?: unknown }).then === "function";
};

/** Runs `done` now for sync values, or after the promise settles. */
export const after = <T>(
	value: T,
	done: () => void,
): T | Promise<Awaited<T>> => {
	if (isPromise(value)) {
		return Promise.resolve(value).finally(done);
	}
	done();
	return value;
};

/** Resolves after `ms`, or rejects early if `signal` aborts. */
export const delay = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}

		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);

		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
