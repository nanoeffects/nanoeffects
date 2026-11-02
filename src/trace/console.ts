import type { Phase, TraceLogger } from "../core/types";
import { createTaskIndex, type KnownTask } from "./task-index";

// how many tasks `chain` remembers: the ones that report nothing never close
const CHAIN_TASKS = 1000;

export type ConsoleLoggerOptions = {
	/** Defaults to `globalThis.console`. */
	console?: Pick<Console, "debug" | "error">;
	/** Prepended to every line. */
	prefix?: string;
	/** Append where the listener was registered, to the lines of events that have it. Default `false`. */
	source?: boolean;
	/** Append the path from the root, with the listeners that report nothing, to the line of an `error`. Default `false`. */
	chain?: boolean;
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
	const withSource = options.source === true;
	const locationOf = (source: string | undefined) =>
		withSource && source !== void 0 ? ` (${source})` : "";
	const depths = new Map<number, number>();
	const index = options.chain === true ? createTaskIndex(CHAIN_TASKS) : void 0;

	const chainText = (id: number, phase: Phase) => {
		if (!index || phase !== "error") {
			return "";
		}
		const types: string[] = [];
		const seen = new Set<number>();
		let next: number | undefined = id;
		while (next !== void 0 && !seen.has(next)) {
			seen.add(next);
			const known: KnownTask | undefined = index.tasks.get(next);
			if (!known) {
				break;
			}
			types.push(known.type);
			next = known.parentId;
		}
		return types.length > 1 ? ` (${types.reverse().join(" → ")})` : "";
	};

	const log: TraceLogger = ({
		id,
		parentId,
		type,
		effect,
		phase,
		payload,
		error,
		traceGroupId,
		source,
	}) => {
		if (!depths.has(id)) {
			depths.set(
				id,
				typeof parentId === "number" ? (depths.get(parentId) ?? 0) + 1 : 0,
			);
		}
		const indent = "  ".repeat(depths.get(id) ?? 0);

		if (phase !== "start") {
			depths.delete(id);
		}

		const group = traceGroupId === void 0 ? "" : ` [${traceGroupId}]`;
		const where = locationOf(source);
		const path = chainText(id, phase);
		const line = `${prefix}${group} ${indent}${type} · ${effect} ${phase}${where}${path}`;
		if (phase === "error") {
			out?.error(line, error);
		} else {
			out?.debug(line, payload);
		}
	};
	if (index) {
		log.task = index.task;
	}
	return log;
};
