import type { ActionCreator, FreeActionCreator } from "../core/action-creator";
import type { Context } from "../core/bus";
import type { EventMap, Keys } from "../core/types";
import { onAbort } from "../utils";
import { withGroup } from "./group";

export type TakeOptions<P> = {
	/**
	 * Wait for the first payload this accepts; others are skipped. A type guard
	 * (`(payload): payload is T`) narrows the type of the result to `T`.
	 */
	predicate?: (payload: P) => boolean;
	/** Stop waiting when this aborts, e.g. the signal of a `race` starter. */
	signal?: AbortSignal | undefined;
};

/**
 * Waits for the next `event` on the bus and resolves with its payload. `event` is the name
 * of an event or an action creator, as for `bus.on`. It sees
 * only events emitted after the call, takes only one, and unsubscribes when it
 * is done. If `ctx` (or `options.signal`) aborts first, it unsubscribes and
 * rejects with the abort reason.
 *
 * @example
 * ```ts
 * bus.on("login", async (user, ctx) => {
 *   const reason = await take(ctx, "logout");
 *   cleanup(user, reason);
 * });
 *
 * // wait for a matching event, but not longer than 5 s
 * const done = await timeout(ctx, 5000, ({ signal }) =>
 *   take(ctx, "saved", { signal, predicate: (id) => id === draftId }),
 * );
 *
 * // an action creator works as the name does, and gives its payload type
 * const stopped = await take(ctx, stopRequested);
 *
 * // a type guard narrows the result: `failed` is `{ ok: false }`
 * const failed = await take(ctx, "result", {
 *   predicate: (result): result is { ok: false } => !result.ok,
 * });
 * ```
 */
export function take<E extends EventMap, K extends Keys<E>, T extends E[K]>(
	ctx: Context<E>,
	event: K,
	options: TakeOptions<E[K]> & { predicate: (payload: E[K]) => payload is T },
): Promise<T>;
export function take<E extends EventMap, K extends Keys<E>>(
	ctx: Context<E>,
	event: K,
	options?: TakeOptions<E[K]>,
): Promise<E[K]>;
// A creator without a payload type comes before the one with a payload type, as in `On<E>`.
export function take<E extends EventMap, K extends Keys<E>, T extends E[K]>(
	ctx: Context<E>,
	creator: FreeActionCreator<K>,
	options: TakeOptions<E[K]> & { predicate: (payload: E[K]) => payload is T },
): Promise<T>;
export function take<E extends EventMap, K extends Keys<E>>(
	ctx: Context<E>,
	creator: FreeActionCreator<K>,
	options?: TakeOptions<E[K]>,
): Promise<E[K]>;
export function take<E extends EventMap, P, T extends P>(
	ctx: Context<E>,
	creator: ActionCreator<P>,
	options: TakeOptions<P> & { predicate: (payload: P) => payload is T },
): Promise<T>;
export function take<E extends EventMap, P>(
	ctx: Context<E>,
	creator: ActionCreator<P>,
	options?: TakeOptions<P>,
): Promise<P>;
export function take(
	ctx: Context<EventMap>,
	event: string | { type: string },
	options: TakeOptions<unknown> = {},
): Promise<unknown> {
	return withGroup(
		"take",
		ctx,
		(group) =>
			new Promise<unknown>((resolve, reject) => {
				const { predicate } = options;
				const stops: Array<() => void> = [];
				const stop = () => {
					for (const fn of stops) {
						fn();
					}
				};
				const fail = (reason: unknown) => {
					stop();
					reject(reason);
				};

				// the overloads above check the event; `ctx.on` takes a name or a creator
				const target = event as never;
				stops.push(
					ctx.on(target, (payload: unknown) => {
						if (!predicate || predicate(payload)) {
							stop();
							resolve(payload);
						}
					}),
				);
				stops.push(onAbort(group, fail));
				stops.push(onAbort({ signal: options.signal }, fail));
			}),
	);
}
