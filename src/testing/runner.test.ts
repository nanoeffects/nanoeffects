import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Clock, fakeTimersClock } from "./clock";
import { createMarbleBus } from "./runner";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

const wait = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const setup = () => createMarbleBus({ clock: fakeTimersClock(vi) });

describe("createMarbleBus", () => {
	it("puts a timer at the edge of a frame in the frame of its time", async () => {
		const marbles = setup();
		async function slow() {
			await wait(100);
		}
		marbles.bus.on("go", slow);

		const result = await marbles.run({
			emits: { go: { marble: "a" } },
			frames: 11,
		});

		expect(result.rows()).toEqual({ "slow:run": "s---------d" });
	});

	it("drops an event that happens after the last frame", async () => {
		const marbles = setup();
		async function slow() {
			await wait(100);
		}
		marbles.bus.on("go", slow);

		const result = await marbles.run({
			emits: { go: { marble: "a" } },
			frames: 10,
		});

		expect(result.rows()).toEqual({ "slow:run": "s---------" });
	});

	it("emits the characters of a group in one frame, in order, with their values", async () => {
		const marbles = setup();
		const seen: unknown[] = [];
		marbles.bus.on("go", (value) => {
			seen.push(value);
		});

		await marbles.run({
			emits: { go: { marble: "(ab)-c", values: { a: 1, b: 2 } } },
		});

		expect(seen).toEqual([1, 2, "c"]);
	});

	it("runs as many frames as the longest diagram by default", async () => {
		const marbles = setup();
		marbles.bus.on("go", function listener() {});

		const result = await marbles.run({
			emits: { go: { marble: "a--" }, other: { marble: "-b---" } },
		});

		expect(result.frames).toBe(5);
		expect(result.rows()).toEqual({ "listener:run": "(sd)----" });
	});

	it("throws for a bad diagram before it emits anything", async () => {
		const marbles = setup();
		const seen: unknown[] = [];
		marbles.bus.on("go", (value) => {
			seen.push(value);
		});

		await expect(
			marbles.run({
				emits: { go: { marble: "a---" }, bad: { marble: "a|" } },
			}),
		).rejects.toThrow('marble "a|"');
		expect(seen).toEqual([]);
	});

	it("works with a clock of its own", async () => {
		let time = 0;
		const clock: Clock = {
			advance: (ms) => {
				time += ms;
			},
			now: () => time,
		};
		const marbles = createMarbleBus({ clock, frame: 5 });
		marbles.bus.on("go", function listener() {});

		const result = await marbles.run({ emits: { go: { marble: "a-a" } } });

		expect(time).toBe(15);
		expect(result.rows()).toEqual({ "listener:run": "(sd)-(sd)" });
	});

	it("starts again from nothing at each run", async () => {
		const marbles = setup();
		marbles.bus.on("go", function listener() {});

		await marbles.run({ emits: { go: { marble: "a" } } });
		const second = await marbles.run({ emits: { go: { marble: "-a" } } });

		expect(second.rows()).toEqual({ "listener:run": "-(sd)" });
	});
});

describe("expect", () => {
	const run = async () => {
		const marbles = setup();
		async function first() {
			await wait(20);
		}
		async function second() {
			await wait(30);
		}
		marbles.bus.on("go", first);
		marbles.bus.on("go", second);

		return marbles.run({ emits: { go: { marble: "a" } }, frames: 5 });
	};

	it("passes when the rows match and returns the result", async () => {
		const result = await run();

		expect(result.expect({ "first:run": "s-d--", "second:run": "s--d-" })).toBe(
			result,
		);
	});

	it("pads a short diagram with nothing", async () => {
		const result = await run();

		expect(() => result.expect({ "first:run": "s-d" })).not.toThrow();
	});

	it("fails with both diagrams one under the other", async () => {
		const result = await run();

		expect(() => result.expect({ "first:run": "s---d" })).toThrow(
			'marble row "first:run" differs\n  expected  s---d\n  received  s-d--',
		);
	});

	it("fails for a row that no task has, and lists the rows", async () => {
		const result = await run();

		expect(() => result.expect({ "third:run": "s" })).toThrow(
			"matches no task; rows: first:run, second:run",
		);
	});

	it("takes an effect alone only when one row has it", async () => {
		const result = await run();

		expect(() => result.expect({ run: "s-d--" })).toThrow(
			"matches more than one task (first:run, second:run): give the full key",
		);
	});

	it("takes the effect alone when one row has it", async () => {
		const marbles = setup();
		function only() {}
		marbles.bus.on("go", only);
		const result = await marbles.run({ emits: { go: { marble: "a" } } });

		expect(() => result.expect({ run: "(sd)" })).not.toThrow();
	});

	it("throws for a letter that is not a phase", async () => {
		const result = await run();

		expect(() => result.expect({ "first:run": "q" })).toThrow(
			'"q" is not a phase',
		);
	});
});

describe("the entry", () => {
	it("imports no test runner", () => {
		const folder = join(import.meta.dirname);
		const files = readdirSync(folder).filter(
			(name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
		);
		const importing = files.filter((name) =>
			/^import .*from "(vitest|jest|@jest\/globals)"/m.test(
				readFileSync(join(folder, name), "utf8"),
			),
		);

		expect(files.length).toBeGreaterThan(0);
		expect(importing).toEqual([]);
	});
});
