import { describe, expect, it } from "vitest";
import { diagramOf, framesOfDiagram, phaseFramesOf } from "./marble";

describe("framesOfDiagram", () => {
	it("splits idle frames and characters", () => {
		expect(framesOfDiagram("-a--b")).toEqual([[], ["a"], [], [], ["b"]]);
	});

	it("reads a group as one frame, in order", () => {
		expect(framesOfDiagram("a(bc)-")).toEqual([["a"], ["b", "c"], []]);
	});

	it("gives nothing for an empty diagram", () => {
		expect(framesOfDiagram("")).toEqual([]);
	});

	it.each([
		["a|", "|"],
		["a b", "space"],
		["(a", "not closed"],
		["a)", '")" without'],
		["()", "empty group"],
		["((a))", "inside a group"],
		["(a-b)", '"-" inside'],
	])("throws for %s and says where", (diagram, reason) => {
		expect(() => framesOfDiagram(diagram)).toThrow(reason);
		expect(() => framesOfDiagram(diagram)).toThrow(`marble "${diagram}"`);
	});
});

describe("phaseFramesOf", () => {
	it("accepts the letters of the phases", () => {
		expect(phaseFramesOf("s-(dx)ce")).toEqual([
			["s"],
			[],
			["d", "x"],
			["c"],
			["e"],
		]);
	});

	it("throws for another letter and names it", () => {
		expect(() => phaseFramesOf("s-q")).toThrow('"q" is not a phase');
	});
});

describe("diagramOf", () => {
	it("renders idle frames, a character and a group", () => {
		expect(diagramOf([["s"], [], ["d", "x"]], 4)).toBe("s-(dx)-");
	});

	it("pads to the length and cuts nothing it was not asked to", () => {
		expect(diagramOf([], 3)).toBe("---");
		expect(diagramOf([["s"], ["d"], ["e"]], 2)).toBe("sd");
	});

	it("round-trips a diagram", () => {
		const diagram = "s--(dx)c-";
		const frames = phaseFramesOf(diagram);

		expect(diagramOf(frames, frames.length)).toBe(diagram);
	});
});
