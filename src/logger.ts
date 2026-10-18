import type { Trace, TraceLogger } from "./types";
import { report } from "./utils";

/** Merges `trace` into one hook that isolates failures of each logger. */
export const combineLoggers = (trace?: Trace): TraceLogger | null => {
	const loggers = typeof trace === "function" ? [trace] : [...(trace ?? [])];

	if (loggers.length === 0) {
		return null;
	}

	return (event) => {
		for (const log of loggers) {
			try {
				log(event);
			} catch (error) {
				report("trace logger failed", error);
			}
		}
	};
};
