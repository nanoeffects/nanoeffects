/**
 * A `fetch` that carries a given signal, so the request stops when the signal aborts and the caller never passes
 * it. Give it to `fromSignal` and every task gets a `ctx.fetch` made from its own signal. A call that has a
 * `signal` of its own stops with whichever aborts first.
 *
 * @example
 * ```ts
 * const bus = createBus().use(
 *   contextPlugin({ fetch: fromSignal(signalFetch) }),
 * );
 *
 * bus.on("search", latest(async (query, ctx) => {
 *   const response = await ctx.fetch(`/api?q=${query}`); // stops when the policy cancels the handler
 *   ctx.emit("results", await response.json());
 * }));
 * ```
 */
export const signalFetch =
	(signal: AbortSignal): typeof fetch =>
	(input, init) => {
		const own = init?.signal;
		const joined = own ? AbortSignal.any([signal, own]) : signal;

		return fetch(input, { ...init, signal: joined });
	};
