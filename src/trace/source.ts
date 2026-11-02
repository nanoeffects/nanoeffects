// Where a listener was registered, read from the stack of an `Error` made when it was.
// The format of a stack is not standard, so this reads the three that exist and gives up on any other.

const locationOf = (text: string) => {
	const found = /^(.+):(\d+):(\d+)$/.exec(text);

	return found ? text : void 0;
};

// V8: `at fn (file:1:2)`, `at async fn (file:1:2)`, `at file:1:2`
const v8Frame = (line: string) => {
	const body = line.slice(3).replace(/^async /, "");
	const open = body.lastIndexOf(" (");
	const inner = open < 0 ? body : body.slice(open + 2).replace(/\)$/, "");

	return locationOf(inner);
};

// Safari and Firefox: `fn@file:1:2`, `@file:1:2`, `fn@[native code]`
const geckoFrame = (line: string) =>
	locationOf(line.slice(line.indexOf("@") + 1));

/** One entry for each frame of a stack, in order: its `file:line:column`, or `void 0` when it has none. */
export const framesOf = (stack: unknown) => {
	if (typeof stack !== "string") {
		return [];
	}
	const frames: (string | undefined)[] = [];
	for (const raw of stack.split("\n")) {
		const line = raw.trim();
		if (line.startsWith("at ")) {
			frames.push(v8Frame(line));
		} else if (line.includes("@")) {
			frames.push(geckoFrame(line));
		}
	}

	return frames;
};

/** The place of the frame that comes after the first `skip` frames; `void 0` when the stack has none. Never throws. */
export const sourceFrom = (stack: unknown, skip: number) =>
	framesOf(stack)[skip];
