import { afterEach, describe, expect, it, vi } from "vitest";
import { combineLoggers } from "./logger";
import type { TraceEvent } from "./types";

const event: TraceEvent = {
	id: 1,
	type: "a",
	effect: "latest",
	phase: "start",
	payload: 1,
};

describe("combineLoggers", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns null without loggers", () => {
		expect(combineLoggers()).toBeNull();
		expect(combineLoggers([])).toBeNull();
	});

	it("wraps a single logger", () => {
		const log = vi.fn();
		combineLoggers(log)?.(event);

		expect(log).toHaveBeenCalledWith(event);
	});

	it("calls every logger in order", () => {
		const calls: string[] = [];
		combineLoggers([() => calls.push("first"), () => calls.push("second")])?.(
			event,
		);

		expect(calls).toEqual(["first", "second"]);
	});

	it("isolates a logger that throws", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const after = vi.fn();
		const combined = combineLoggers([
			() => {
				throw new Error("bad logger");
			},
			after,
		]);

		expect(() => combined?.(event)).not.toThrow();
		expect(after).toHaveBeenCalledWith(event);
		expect(error).toHaveBeenCalledTimes(1);
	});
});
