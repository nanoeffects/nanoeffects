import { describe, expect, it } from "vitest";
import { framesOf, sourceFrom } from "./source";

const v8Stack = [
	"Error",
	"    at withCaller (file:///app/dist/trace.js:10:5)",
	"    at wrapped (file:///app/dist/trace.js:50:9)",
	"    at saveName (file:///app/src/user.ts:12:5)",
	"    at async run (file:///app/src/main.ts:3:1)",
].join("\n");

describe("framesOf", () => {
	it("reads V8, with and without a function, and with async", () => {
		const stack = [
			"Error: x",
			"    at fn (/a/b.js:1:2)",
			"    at /a/c.js:3:4",
			"    at async fn2 (/a/d.js:5:6)",
			"    at <anonymous>",
		].join("\n");

		expect(framesOf(stack)).toEqual([
			"/a/b.js:1:2",
			"/a/c.js:3:4",
			"/a/d.js:5:6",
			void 0,
		]);
	});

	it("reads Firefox and Safari", () => {
		const stack = [
			"saveName@https://app.test/main.js:10:3",
			"@https://app.test/@scope/pkg.js:4:1",
			"forEach@[native code]",
		].join("\n");

		expect(framesOf(stack)).toEqual([
			"https://app.test/main.js:10:3",
			"https://app.test/@scope/pkg.js:4:1",
			void 0,
		]);
	});

	it("gives nothing for a stack that is not a string or is empty", () => {
		expect(framesOf(void 0)).toEqual([]);
		expect(framesOf(42)).toEqual([]);
		expect(framesOf("")).toEqual([]);
	});

	it("reads a Windows path", () => {
		expect(framesOf("    at fn (C:\\app\\user.js:1:2)")).toEqual([
			"C:\\app\\user.js:1:2",
		]);
	});
});

describe("sourceFrom", () => {
	it("takes the frame after the skipped ones, in V8", () => {
		expect(sourceFrom(v8Stack, 2)).toBe("file:///app/src/user.ts:12:5");
	});

	it("takes it in the format of Firefox", () => {
		const stack = [
			"withCaller@https://app.test/trace.js:1:1",
			"wrapped@https://app.test/trace.js:2:1",
			"saveName@https://app.test/main.js:10:3",
		].join("\n");

		expect(sourceFrom(stack, 2)).toBe("https://app.test/main.js:10:3");
	});

	it("gives nothing when no frame is left or the stack is missing", () => {
		expect(sourceFrom("Error", 2)).toBeUndefined();
		expect(sourceFrom(void 0, 2)).toBeUndefined();
		expect(sourceFrom(v8Stack, 10)).toBeUndefined();
	});
});
