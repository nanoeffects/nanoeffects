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

	it("2. a handler emits through its context", () => {
		expect(step2()).toEqual(["out at -1"]);
	});

	it("3, 4, 5. policies and effects are handlers", () => {
		expect(() => [step3(), step4(), step5()]).not.toThrow();
	});

	it("6. take waits for the next event", async () => {
		expect(await step6()).toEqual(["nano at 40"]);
	});

	it("7. three ways to name an event", () => {
		expect(step7()).toEqual([
			"string 1",
			"action 1",
			"string 2",
			"action 2",
			"string 3",
			"action 3",
			42,
		]);
	});

	it("8. a command needs a registered handler", async () => {
		expect(await step8()).toEqual([
			'No handler for command "user/get"',
			"user 1",
			'No handler for command "user/get"',
		]);
	});

	it("9. a module is undone as a whole, with its commands", () => {
		expect(step9()).toEqual(["hello Ada", true, 4]);
	});

	it("10. typed events", () => {
		expect(step10()).toEqual([3]);
	});

	it("11. errors and typos", () => {
		expect(step11()).toEqual(["error: boom", "nobody listens to reset"]);
	});
});
