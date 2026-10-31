import type { FromSignal } from "../core/context-types";
import { signalFieldKey } from "../core/signal-field-key";

/**
 * Marks a field of `contextPlugin` as a value that needs the signal of its task: a
 * client, a database handle. `make` runs when the task first reads the field, with the
 * `ctx.signal` of that task, and runs once for it. A child task (`ctx.run`) makes its
 * own with its own signal. Without `contextPlugin` the marker means nothing.
 *
 * @example
 * ```ts
 * const bus = createBus().use(
 *   contextPlugin({
 *     logger, // a plain field, the same for every task
 *     http: fromSignal((signal) => axios.create({ signal })), // one client per task, aborted with it
 *   }),
 * );
 *
 * bus.on("user/open", (id, { http }) => http.get(`/users/${id}`));
 * ```
 */
export const fromSignal = <T>(
	make: (signal: AbortSignal) => T,
): FromSignal<T> => ({ [signalFieldKey]: make });
