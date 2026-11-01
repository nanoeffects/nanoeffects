import { describe, expect, it } from "vitest";
import { safeSerialize } from "./serialize";

class User {
	name: string;
	constructor(name: string) {
		this.name = name;
	}
}

// the result must be a JSON value that `JSON.stringify` takes, whatever went in
const serialized = (
	value: unknown,
	options?: { maxDepth?: number; maxSize?: number },
) => {
	const result = safeSerialize(value, options);
	expect(() => JSON.stringify(result)).not.toThrow();

	return result;
};

describe("safeSerialize", () => {
	describe("plain values", () => {
		it("keeps strings, booleans, finite numbers and null", () => {
			expect(serialized({ a: "x", b: true, c: 1.5, d: null })).toEqual({
				a: "x",
				b: true,
				c: 1.5,
				d: null,
			});
		});

		it("writes NaN and the infinities as text", () => {
			expect(serialized([Number.NaN, Number.POSITIVE_INFINITY])).toEqual([
				"NaN",
				"Infinity",
			]);
		});

		it("writes bigint, symbol, function and undefined as text", () => {
			expect(
				serialized({
					big: 10n,
					sym: Symbol("s"),
					fn: function named() {},
					none: void 0,
				}),
			).toEqual({
				big: "10n",
				sym: "Symbol(s)",
				fn: "[Function named]",
				none: "[undefined]",
			});
		});

		it("cuts a very long string", () => {
			const result = serialized("x".repeat(10_000));

			expect(typeof result === "string" && result.length).toBeLessThan(2100);
		});
	});

	describe("errors", () => {
		it("keeps the name, message, stack and cause", () => {
			const result = serialized(
				new Error("boom", { cause: new TypeError("inner") }),
			);

			expect(result).toMatchObject({
				name: "Error",
				message: "boom",
				cause: { name: "TypeError", message: "inner" },
			});
			expect(result).toHaveProperty("stack");
		});

		it("does not look for a cause that is not there", () => {
			expect(serialized(new Error("x"))).not.toHaveProperty("cause");
		});
	});

	describe("cycles", () => {
		it("names a reference to itself", () => {
			const value: { self?: unknown; name: string } = { name: "a" };
			value.self = value;

			expect(serialized(value)).toEqual({ name: "a", self: "[Circular]" });
		});

		it("names a cycle through a list and a Map", () => {
			const list: unknown[] = [];
			list.push(new Map([["k", list]]));

			expect(serialized(list)).toEqual([{ $map: [["k", "[Circular]"]] }]);
		});

		it("does not call the same object that appears twice a cycle", () => {
			const shared = { n: 1 };

			expect(serialized({ a: shared, b: shared })).toEqual({
				a: { n: 1 },
				b: { n: 1 },
			});
		});
	});

	describe("collections and classes", () => {
		it("writes Map and Set", () => {
			expect(
				serialized({ m: new Map([["a", 1]]), s: new Set([1, 2]) }),
			).toEqual({
				m: { $map: [["a", 1]] },
				s: { $set: [1, 2] },
			});
		});

		it("keeps the own fields and the name of a class instance", () => {
			expect(serialized(new User("Ann"))).toEqual({
				$class: "User",
				name: "Ann",
			});
		});

		it("never calls a getter", () => {
			let calls = 0;
			const value = {
				ok: 1,
				get bad() {
					calls += 1;
					throw new Error("getter");
				},
			};

			expect(serialized(value)).toEqual({ ok: 1, bad: "[Getter]" });
			expect(calls).toBe(0);
		});

		it("never calls toJSON", () => {
			let calls = 0;
			const value = {
				toJSON() {
					calls += 1;
					return "x";
				},
			};
			serialized(value);

			expect(calls).toBe(0);
		});

		it("handles a null prototype object", () => {
			const value = Object.create(null) as Record<string, unknown>;
			value.a = 1;

			expect(serialized(value)).toEqual({ a: 1 });
		});

		it("names the dates, and an invalid one", () => {
			expect(serialized([new Date(0), new Date(Number.NaN)])).toEqual([
				"1970-01-01T00:00:00.000Z",
				"[Invalid Date]",
			]);
		});

		it("writes a typed array by its name and length", () => {
			expect(serialized(new Uint8Array(4))).toEqual({
				$class: "Uint8Array",
				length: 4,
			});
		});

		it("names a WeakMap, a WeakSet and a Promise", () => {
			expect(
				serialized([new WeakMap(), new WeakSet(), Promise.resolve()]),
			).toEqual(["[WeakMap]", "[WeakSet]", "[Promise]"]);
		});

		it("names a DOM-like node without a global Node", () => {
			expect(serialized({ nodeType: 1, nodeName: "DIV" })).toBe("[DOM DIV]");
		});

		it("reads a sparse array and a frozen object", () => {
			const sparse = new Array(3);
			sparse[0] = 1;
			sparse[2] = 3;

			expect(serialized(sparse)).toHaveLength(3);
			expect(serialized(Object.freeze({ a: 1 }))).toEqual({ a: 1 });
		});
	});

	describe("hostile values", () => {
		it("does not throw for a Proxy whose every trap throws", () => {
			const trap = () => {
				throw new Error("trap");
			};
			const proxy = new Proxy(
				{},
				{ get: trap, ownKeys: trap, getOwnPropertyDescriptor: trap, has: trap },
			);

			expect(serialized({ before: 1, proxy, after: 2 })).toEqual({
				before: 1,
				proxy: "[Unserializable]",
				after: 2,
			});
		});

		it("does not throw for a revoked Proxy", () => {
			const { proxy, revoke } = Proxy.revocable({}, {});
			revoke();

			expect(() => safeSerialize(proxy)).not.toThrow();
		});

		it("does not throw for an object whose constructor throws on read", () => {
			const value = Object.create({
				get constructor() {
					throw new Error("no");
				},
			});
			value.a = 1;

			expect(() => safeSerialize(value)).not.toThrow();
		});
	});

	describe("limits", () => {
		it("turns a value past maxDepth into a marker", () => {
			expect(serialized({ a: { b: { c: 1 } } }, { maxDepth: 2 })).toEqual({
				a: { b: "[Object]" },
			});
			expect(serialized([[[1]]], { maxDepth: 2 })).toEqual([["[Array]"]]);
		});

		it("cuts a very long list by maxSize", () => {
			const result = serialized(new Array(1_000_000).fill(1), { maxSize: 10 });

			expect(Array.isArray(result) && result.length).toBeLessThan(20);
			expect(JSON.stringify(result)).toContain("more]");
		});

		it("shares the budget between branches", () => {
			const value = { a: [1, 2, 3, 4, 5], b: [1, 2, 3, 4, 5] };
			const text = JSON.stringify(serialized(value, { maxSize: 6 }));

			// the first list takes most of the budget, so the second one is cut
			expect(text).toContain("[Cut]");
		});

		it("finishes for a deep chain with no stack overflow", () => {
			let value: unknown = 1;
			for (let index = 0; index < 100_000; index += 1) {
				value = { next: value };
			}

			expect(() => safeSerialize(value)).not.toThrow();
		});
	});

	describe("random values", () => {
		// a seeded generator, so a failure repeats
		const generator = (seed: number) => () => {
			seed = (seed * 1664525 + 1013904223) % 4294967296;
			return seed / 4294967296;
		};

		const make = (
			random: () => number,
			depth: number,
			pool: object[],
		): unknown => {
			const pick = Math.floor(random() * 9);
			if (depth > 4 || pick < 3) {
				return [1, "s", null, true, Number.NaN, 10n][Math.floor(random() * 6)];
			}
			if (pick === 3 && pool.length > 0) {
				return pool[Math.floor(random() * pool.length)];
			}
			const made: object =
				pick === 4
					? []
					: pick === 5
						? new Map()
						: pick === 6
							? new Set()
							: pick === 7
								? new User("u")
								: {};
			pool.push(made);
			for (let index = 0; index < 3; index += 1) {
				const child = make(random, depth + 1, pool);
				if (Array.isArray(made)) {
					made.push(child);
				} else if (made instanceof Map) {
					made.set(index, child);
				} else if (made instanceof Set) {
					made.add(child);
				} else {
					Object.assign(made, { [`k${index}`]: child });
				}
			}

			return made;
		};

		it("always gives a JSON value for random nested values with cycles", () => {
			for (let seed = 1; seed <= 300; seed += 1) {
				const value = make(generator(seed), 0, []);

				expect(() => serialized(value)).not.toThrow();
			}
		});
	});
});
