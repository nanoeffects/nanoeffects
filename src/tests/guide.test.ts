// the steps of docs/guide.md run as they are written there
import { describe, expect, it } from "vitest";
import {
	step1,
	step2,
	step3,
	step4,
	step5,
	step6,
	step7,
	step8,
	step9,
	step10,
	step11,
} from "../../examples/guide";

describe("docs/guide.md", () => {
	it("1. subscribe, emit, unsubscribe", () => {
		expect(step1()).toEqual(["hello Ada"]);
	});

	it("2. typed events", () => {
		expect(step2()).toEqual([3]);
	});

	it("3. a handler emits through its context", () => {
		expect(step3()).toEqual(["out at -1"]);
	});

	it("4. three ways to name an event", () => {
		expect(step4()).toEqual([
			"string 1",
			"action 1",
			"string 2",
			"action 2",
			"string 3",
			"action 3",
			42,
		]);
	});

	it("5. a command needs a registered handler", async () => {
		expect(await step5()).toEqual([
			'No handler for command "user/get"',
			"user 1",
			'No handler for command "user/get"',
		]);
	});

	it("6, 7, 8. policies and effects are handlers", () => {
		expect(() => [step6(), step7(), step8()]).not.toThrow();
	});

	it("9. take waits for the next event", async () => {
		expect(await step9()).toEqual(["nano at 40"]);
	});

	it("10. a module is undone as a whole, with its commands", () => {
		expect(step10()).toEqual(["hello Ada", true]);
	});

	it("11. errors and typos", () => {
		expect(step11()).toEqual(["error: boom", "nobody listens to reset"]);
	});
});
