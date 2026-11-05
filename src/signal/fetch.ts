import type { WithSignal } from "../core/bus";

/**
 * A `fetch` that stops with its task: an effect, so `ctx` is the first argument and the request carries
 * `ctx.signal`. The caller never passes the signal. A call that has a `signal` of its own in `init` stops with
 * whichever aborts first. Outside a task pass `{ signal }` of the source, or `{}` in plain JavaScript.
 *
 * With `effectsPlugin({ fetch: signalFetch })` every task has a `ctx.fetch(input, init)` bound to itself.
 *
 * @example
 * ```ts
 * bus.on("search", latest(async (query, ctx) => {
 *   const response = await signalFetch(ctx, `/api?q=${query}`); // stops when the policy cancels the handler
 *   ctx.emit("results", await response.json());
 * }));
 *
 * const withFetch = createBus().use(effectsPlugin({ fetch: signalFetch }));
 * withFetch.on("search", latest(async (query, { fetch }) => fetch(`/api?q=${query}`)));
 * ```
 */
export const signalFetch = (
	ctx: WithSignal,
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> => {
	const own = init?.signal;
	const signal =
		own && ctx.signal
			? AbortSignal.any([ctx.signal, own])
			: (own ?? ctx.signal);

	return fetch(input, { ...init, signal });
};
