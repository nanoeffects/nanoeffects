import type { Context } from "../bus";
import type { EventMap, Keys } from "../types";
import { onAbort } from "../utils";
import { withGroup } from "./group";

export type TakeOptions<P> = {
	/** Wait for the first payload this accepts; others are skipped. */
	predicate?: (payload: P) => boolean;
	/** Stop waiting when this aborts, e.g. the signal of a `race` starter. */
	signal?: AbortSignal | undefined;
};

/**
 * Waits for the next `event` on the bus and resolves with its payload. It sees
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
 * ```
 */
export const take = <E extends EventMap, K extends Keys<E>>(
	ctx: Context<E>,
	event: K,
	options: TakeOptions<E[K]> = {},
): Promise<E[K]> =>
	withGroup(
		"take",
		ctx,
		(group) =>
			new Promise<E[K]>((resolve, reject) => {
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

				stops.push(
					ctx.on(event, (payload) => {
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
