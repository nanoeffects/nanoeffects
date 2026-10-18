import { describe, expect, it } from "vitest";
import { eventKey, eventPayload } from "./event";

describe("event", () => {
	it("eventKey reads a string key", () => {
		expect(eventKey("a")).toBe("a");
	});

	it("eventKey reads the type of an object", () => {
		expect(eventKey({ type: "a" })).toBe("a");
	});

	it("eventPayload prefers the payload of an object event", () => {
		expect(eventPayload({ type: "a", payload: 1 }, 2)).toBe(1);
	});

	it("eventPayload uses the argument for a string key", () => {
		expect(eventPayload("a", 2)).toBe(2);
	});

	it("eventPayload uses the argument for a handler function", () => {
		const handler = Object.assign(() => {}, { type: "a" as const });

		expect(eventPayload(handler, 3)).toBe(3);
	});
});
