// Type-checks the code blocks of docs/*.md against the sources, so a stale snippet fails a gate.
// `node scripts/docs-check.mjs`. A block directly after `<!-- docs-check: skip -->` is not checked;
// names that come from the reader's app (`api`, `report`) are declared in docs-stubs.d.ts.
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkedLanguages = new Set([
	"js",
	"javascript",
	"jsx",
	"ts",
	"typescript",
	"tsx",
]);
const isJsx = (block) => block.language.endsWith("x");
const skipMarker = /^<!--\s*docs-check:\s*skip\b.*-->$/;

/**
 * Finds the fenced code blocks of a Markdown page.
 * `line` is the line of the opening fence, counted from 1.
 */
export function extractBlocks(markdown, page) {
	const lines = markdown.split("\n");
	const blocks = [];
	let open = null;
	for (const [index, text] of lines.entries()) {
		const fence = /^\s*```(\S*)/.exec(text);
		if (open === null && fence) {
			const before = lines[index - 1]?.trim() ?? "";
			open = {
				page,
				line: index + 1,
				language: fence[1].toLowerCase(),
				skip: skipMarker.test(before),
				code: [],
			};
		} else if (open !== null && /^\s*```\s*$/.test(text)) {
			blocks.push({ ...open, code: open.code.join("\n") });
			open = null;
		} else if (open !== null) {
			open.code.push(text);
		}
	}
	return blocks;
}

const isPlainJs = (block) => block.language.startsWith("j");

// A reader of a `js` block gets no types: `createBus()` has an open event map and a handler gets
// an `unknown` payload, so type errors about payloads would be false alarms. These codes are the
// ones that show a stale snippet: a syntax error, a missing name, export or module, a
// wrong argument count, a misspelled option.
const staleCodes = new Set([
	2300, 2304, 2305, 2307, 2353, 2451, 2552, 2554, 2561, 2724,
]);
function isStaleName(message) {
	const code = Number(/^TS(\d+)/.exec(message)?.[1]);
	return code < 2000 || staleCodes.has(code);
}

// one error is `file(line,col): error TSxxxx: message`; the lines that follow it are indented
function parseDiagnostics(output) {
	const diagnostics = [];
	for (const text of output.split("\n")) {
		const head = /^(.+?)\((\d+),\d+\): error (TS\d+: .*)$/.exec(text);
		if (head) {
			diagnostics.push({
				file: head[1],
				line: Number(head[2]),
				message: head[3],
			});
		} else if (/^\s/.test(text) && diagnostics.length > 0) {
			diagnostics.at(-1).message += `\n${text}`;
		}
	}
	return diagnostics;
}

// A block whose first line is a comment with a file name (`// registration.js`) is written under
// that name, so a later block can import it as `./registration`.
function fileNameOf(block, index) {
	const named = /^\/\/ ([\w-]+)\.(?:jsx?|tsx?)$/.exec(
		block.code.split("\n")[0],
	);
	if (named) {
		return `${named[1]}${isJsx(block) ? ".tsx" : ".ts"}`;
	}
	return `block-${index}${isJsx(block) ? ".tsx" : ".ts"}`;
}

/** Writes each block as a module of its own and returns the blocks by file name. */
function writeBlocks(dir, blocks) {
	const names = new Map();
	for (const [index, block] of blocks.entries()) {
		const name = fileNameOf(block, index);
		names.set(name, block);
		// `export {}` makes the block a module, so `const bus` of two blocks do not clash
		writeFileSync(join(dir, name), `${block.code}\nexport {};\n`);
	}
	return names;
}

/** The errors to report, with the page and the line in the page. */
function errorsOf(diagnostics, names) {
	const errors = [];
	for (const diagnostic of diagnostics) {
		const block = names.get(diagnostic.file.split("/").at(-1));
		if (block && isPlainJs(block) && !isStaleName(diagnostic.message)) {
			continue;
		}
		// `line` of the block is its fence; the code starts on the next line
		const line = block ? block.line + diagnostic.line : 0;
		const page = block ? block.page : diagnostic.file;
		errors.push({ page, line, message: diagnostic.message });
	}
	return errors;
}

/**
 * Type-checks the blocks (`jsx` and `tsx` too), each as its own module, with the options and paths of the root
 * tsconfig. The files live in a cache folder inside the project (so imports of installed
 * packages resolve) and are removed at the end.
 */
export function checkBlocks(blocks, { stubs } = {}) {
	const checked = blocks.filter(
		(block) => !block.skip && checkedLanguages.has(block.language),
	);
	const skipped = blocks.filter(
		(block) => block.skip && checkedLanguages.has(block.language),
	).length;
	if (checked.length === 0) {
		return { errors: [], checked: 0, skipped };
	}
	const cache = join(root, "node_modules", ".cache");
	mkdirSync(cache, { recursive: true });
	const dir = mkdtempSync(join(cache, "docs-check-"));
	try {
		const names = writeBlocks(dir, checked);
		const files = stubs ? [stubs] : [];
		writeFileSync(
			join(dir, "tsconfig.json"),
			JSON.stringify({
				extends: join(root, "tsconfig.json"),
				// blocks of plain JS have handlers with untyped parameters on purpose
				compilerOptions: { noImplicitAny: false, types: [], jsx: "preserve" },
				files: [...files, ...names.keys()].map((file) =>
					file === stubs ? file : join(dir, file),
				),
				include: [],
			}),
		);
		const tsc = join(root, "node_modules", ".bin", "tsc");
		const result = spawnSync(
			tsc,
			["-p", dir, "--noEmit", "--pretty", "false"],
			{ cwd: root, encoding: "utf8" },
		);
		const output = `${result.stdout}${result.stderr}`;
		const diagnostics = parseDiagnostics(output);
		const errors = errorsOf(diagnostics, names);
		// a failure with no readable error is a broken run (bad config, crash), not a clean docs tree
		if (result.status !== 0 && diagnostics.length === 0) {
			errors.push({ page: "tsc", line: 0, message: output.trim() });
		}
		return { errors, checked: checked.length, skipped };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Reads every `*.md` of a folder and checks the blocks of all pages together. */
export function checkDocs(docsDir, options) {
	const blocks = [];
	for (const file of readdirSync(docsDir).filter((f) => f.endsWith(".md"))) {
		const path = join(docsDir, file);
		blocks.push(
			...extractBlocks(readFileSync(path, "utf8"), relative(root, path)),
		);
	}
	return checkBlocks(blocks, options);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const { errors, checked, skipped } = checkDocs(join(root, "docs"), {
		stubs: join(root, "scripts", "docs-stubs.d.ts"),
	});
	for (const { page, line, message } of errors) {
		console.error(`${page}:${line}: ${message}`);
	}
	const summary = `docs-check: ${checked} blocks checked, ${skipped} skipped`;
	if (errors.length > 0) {
		console.error(`${summary}, ${errors.length} errors`);
		process.exit(1);
	}
	console.log(summary);
}
