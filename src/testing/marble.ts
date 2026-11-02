// Diagrams of time for tests: one character, or one `(group)`, for each frame.
//
//   emits    `a-b--`    `-` nothing, any other character emits `values[character]`, `(ab)` two in one frame
//   phases   `s--d-`    `s` start, `d` done, `e` error, `c` cancel, `x` drop, `(dx)` two in one frame

import type { Phase } from "../core/types";

const letters: Record<Phase, string> = {
	start: "s",
	done: "d",
	error: "e",
	cancel: "c",
	drop: "x",
};

const phaseLetters = new Set(Object.values(letters));

export const letterOf = (phase: Phase) => letters[phase];

const fail = (diagram: string, index: number, reason: string): never => {
	throw new Error(`marble "${diagram}": ${reason} at position ${index}`);
};

const checkChars = (diagram: string, from: number, text: string) => {
	for (let offset = 0; offset < text.length; offset += 1) {
		const char = text.charAt(offset);
		if (/\s/.test(char) || char === "|") {
			fail(
				diagram,
				from + offset,
				`"${char.trim() || "space"}" is not part of a diagram`,
			);
		}
	}
};

// the group that opens at `open`: its characters, and where the next frame starts
const readGroup = (diagram: string, open: number) => {
	const close = diagram.indexOf(")", open);
	if (close < 0) {
		fail(diagram, open, 'a group that is not closed with ")"');
	}
	const body = diagram.slice(open + 1, close);
	if (body === "") {
		fail(diagram, open, "an empty group");
	}
	const inner = body.indexOf("(");
	if (inner >= 0) {
		fail(diagram, open + 1 + inner, "a group inside a group");
	}
	const dash = body.indexOf("-");
	if (dash >= 0) {
		fail(diagram, open + 1 + dash, '"-" inside a group');
	}
	checkChars(diagram, open + 1, body);

	return { frame: [...body], next: close + 1 };
};

const readFrame = (diagram: string, index: number) => {
	const char = diagram.charAt(index);
	if (char === "(") {
		return readGroup(diagram, index);
	}
	if (char === ")") {
		fail(diagram, index, '")" without "("');
	}
	checkChars(diagram, index, char);

	return { frame: char === "-" ? [] : [char], next: index + 1 };
};

/**
 * Splits a diagram into frames. Each frame is the list of characters that happen in it:
 * empty for `-`. A bad character, an unclosed group or an empty group throws an error that
 * names the diagram and the position.
 */
export const framesOfDiagram = (diagram: string) => {
	const frames: string[][] = [];
	let index = 0;
	while (index < diagram.length) {
		const { frame, next } = readFrame(diagram, index);
		frames.push(frame);
		index = next;
	}

	return frames;
};

/** The frames of a diagram of phases; a letter other than `s d e c x` throws. */
export const phaseFramesOf = (diagram: string) => {
	const frames = framesOfDiagram(diagram);
	let position = 0;
	for (const frame of frames) {
		for (const char of frame) {
			if (!phaseLetters.has(char)) {
				fail(diagram, position, `"${char}" is not a phase (s d e c x)`);
			}
		}
		position += frame.length || 1;
	}

	return frames;
};

/** A diagram from frames, `length` frames long: `-` for an empty frame, `(…)` for several. */
export const diagramOf = (
	frames: readonly (readonly string[])[],
	length: number,
) => {
	let text = "";
	for (let index = 0; index < length; index += 1) {
		const frame = frames[index] ?? [];
		if (frame.length === 0) {
			text += "-";
		} else if (frame.length === 1) {
			text += frame[0];
		} else {
			text += `(${frame.join("")})`;
		}
	}

	return text;
};
