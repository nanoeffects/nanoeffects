import type { Bus } from "../core/bus";
import type { EventMap } from "../core/types";
import { type Entry, peekListeners } from "./listeners";

export type DescribeBusOptions = {
	/** Add where each listener was registered, for the ones `tracePlugin({ source: true })` recorded. Default `false`. */
	source?: boolean;
};

/**
 * The listeners that each event has right now, by name and in the order they were
 * added: the `traceId` of a listener, else its function name, else `"<anonymous>"`.
 * Reads what `tracePlugin` keeps, so it returns `{}` on a bus without the plugin or
 * a tracer, and in the `notrace` build. It changes nothing on the bus. With `{ source: true }`
 * each name is followed by `(file:line:column)` of its registration, when it was recorded.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { consoleLogger, createTracer, describeBus, tracePlugin } from "nanoeffects/trace";
 *
 * const trace = createTracer(consoleLogger());
 * const bus = createBus({ trace }).use(tracePlugin());
 * bus.on("name/changed", function saveName() {});
 *
 * describeBus(bus); // { "name/changed": ["saveName"] }
 * ```
 */
export const describeBus = <E extends EventMap>(
	bus: Bus<E>,
	options: DescribeBusOptions = {},
) => {
	const withSource = options.source === true;
	const label = (entry: Entry) => {
		const name = entry.name ?? "<anonymous>";

		return withSource && entry.source !== void 0
			? `${name} (${entry.source})`
			: name;
	};
	const map: Record<string, string[]> = {};
	for (const [key, list] of peekListeners(bus) ?? []) {
		if (typeof key === "string") {
			map[key] = list.map(label);
		}
	}

	return map;
};
