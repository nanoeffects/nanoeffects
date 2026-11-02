import { afterEach, describe, expect, it, vi } from "vitest";
import { callerStack, takeCaller, wantCaller, withCaller } from "./caller";

afterEach(() => {
	wantCaller(false);
});

describe("withCaller", () => {
	it("reads nothing and runs the call when no one asked", () => {
		const made = vi.spyOn(globalThis, "Error");

		const result = withCaller(() => takeCaller());

		expect(result).toBeUndefined();
		expect(made).not.toHaveBeenCalled();
		made.mockRestore();
	});

	it("holds the stack for the time of the call, and gives it up after", () => {
		wantCaller();

		const held = withCaller(() => takeCaller());

		expect(typeof held).toBe("string");
		expect(takeCaller()).toBeUndefined();
	});

	it("reads one stack for nested calls", () => {
		wantCaller();

		const [outer, inner] = withCaller(() => [
			takeCaller(),
			withCaller(() => takeCaller()),
		]);

		expect(outer).toBe(inner);
	});

	it("gives the slot up when the call throws", () => {
		wantCaller();

		expect(() =>
			withCaller(() => {
				throw new Error("boom");
			}),
		).toThrow("boom");
		expect(takeCaller()).toBeUndefined();
	});

	it("gives a registration made inside another its own stack", () => {
		wantCaller();
		const seen: (string | undefined)[] = [];
		const register = () => withCaller(() => takeCaller());

		withCaller(() => {
			seen.push(takeCaller());
			// a handler that registers again is a new call from the user, but runs after the first returns
		});
		seen.push(register());

		expect(seen[0]).not.toBe(seen[1]);
	});

	it("uses a saved stack in place of the held one, and brings the held one back", () => {
		wantCaller();

		const seen = withCaller(() => {
			const inside = withCaller(() => takeCaller(), "saved stack");

			return [inside, takeCaller()];
		});

		expect(seen[0]).toBe("saved stack");
		expect(seen[1]).not.toBe("saved stack");
		expect(takeCaller()).toBeUndefined();
	});

	it("puts the caller on the third line of the stack", () => {
		wantCaller();
		const wrapper = () => withCaller(() => takeCaller());

		const stack = wrapper();
		const lines = (stack ?? "")
			.split("\n")
			.filter((line) => line.includes("at "));

		expect(lines[0]).toContain("withCaller");
		expect(lines[1]).toContain("wrapper");
		expect(lines[2]).toContain("caller.test.ts");
	});
});

describe("callerStack", () => {
	it("gives the stack that a wrapper above holds", () => {
		wantCaller();

		const [held, kept] = withCaller(() => [takeCaller(), callerStack()]);

		expect(kept).toBe(held);
	});

	it("is nothing when no one asked, and a stack when someone did", () => {
		expect(callerStack()).toBeUndefined();
		wantCaller();

		expect(typeof callerStack()).toBe("string");
	});
});
