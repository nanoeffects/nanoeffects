import type { TraceLogger } from "../core/types";

export type ConsoleLoggerOptions = {
	/** Defaults to `globalThis.console`. */
	console?: Pick<Console, "debug" | "error">;
	/** Prepended to every line. */
	prefix?: string;
};

/**
 * Trace logger that prints one line per phase, indented by task depth.
 * Failures go to `console.error`, everything else to `console.debug`.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>({ trace: createTracer(consoleLogger()) });
 * // search · latest start
 * // search · latest cancel
 * ```
 */
export const consoleLogger = (
	options: ConsoleLoggerOptions = {},
): TraceLogger => {
	const out = options.console ?? globalThis.console;
	const prefix = options.prefix ?? "[nanoeffects]";
	const depths = new Map<number, number>();

	return ({ id, parent, type, effect, phase, payload, error }) => {
		if (!depths.has(id)) {
			depths.set(
				id,
				typeof parent === "number" ? (depths.get(parent) ?? 0) + 1 : 0,
			);
		}
		const indent = "  ".repeat(depths.get(id) ?? 0);

		if (phase !== "start") {
			depths.delete(id);
		}

		const line = `${prefix} ${indent}${type} · ${effect} ${phase}`;
		if (phase === "error") {
			out?.error(line, error);
		} else {
			out?.debug(line, payload);
		}
	};
};
