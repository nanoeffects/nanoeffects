// Type-checks the code blocks of docs/*.md against the sources, so a stale snippet fails a gate.
// `node scripts/docs-check.mjs`. A block directly after `<!-- docs-check: skip -->` is not checked;
// names that come from the reader's app (`api`, `report`) are declared in docs-stubs.d.ts.
import { spawnSync } from "node:child_process";
import {
	existsSync,
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
// under a `##` heading: this section uses the files of the section before it
const continueMarker = /^<!--\s*docs-check:\s*continue\b.*-->$/;
// under any heading: from here the files are new, as in an example of its own
const newMarker = /^<!--\s*docs-check:\s*new\b.*-->$/;
// under any heading: from here the files are a copy of the ones before, and a block of the same name replaces its copy
const forkMarker = /^<!--\s*docs-check:\s*fork\b.*-->$/;

// A `##` heading or a `new` marker starts the files of a new section, a `fork` marker starts a section that
// begins as a copy of the one before, and a `continue` marker goes back to the section before.
function moveSection(files, text) {
	const line = text.trim();
	if (/^## /.test(text) || newMarker.test(line)) {
		files.previous = files.section;
		files.section = files.next++;
	} else if (forkMarker.test(line)) {
		files.parents.set(files.next, files.section);
		files.previous = files.section;
		files.section = files.next++;
	} else if (continueMarker.test(line)) {
		files.section = files.previous;
	}
}

/**
 * Finds the fenced code blocks of a Markdown page.
 * `line` is the line of the opening fence, counted from 1.
 */
export function extractBlocks(markdown, page) {
	const lines = markdown.split("\n");
	const blocks = [];
	let open = null;
	// the files of a block belong to its `##` section; a `continue` marker keeps the section before
	const files = { section: 0, previous: 0, next: 1, parents: new Map() };
	for (const [index, text] of lines.entries()) {
		if (open === null) {
			moveSection(files, text);
		}
		const fence = /^\s*```(\S*)/.exec(text);
		if (open === null && fence) {
			const before = lines[index - 1]?.trim() ?? "";
			open = {
				page,
				line: index + 1,
				language: fence[1].toLowerCase(),
				skip: skipMarker.test(before),
				section: files.section,
				parents: files.parents,
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
// that name in the folder of its `##` section, so a later block of the section can import it as
// `./registration`. Another section or page may use the same name; a section that goes on with
// the files of the one before it says so with `<!-- docs-check: continue -->` under its heading; `<!-- docs-check: new -->` starts new files in the middle of a section.
function fileNameOf(block, index) {
	const named = /^\/\/ ([\w-]+)\.(?:jsx?|tsx?)$/.exec(
		block.code.split("\n")[0],
	);
	if (named) {
		return `${named[1]}${isJsx(block) ? ".tsx" : ".ts"}`;
	}
	return `block-${index}${isJsx(block) ? ".tsx" : ".ts"}`;
}

// The folder of the files of a section of a page: two sections can both name a file `bus.js` or
// `events.js` without one replacing the other, as two examples would be two apps.
const folderOf = (block) =>
	`${block.page.replace(/\.md$/, "").replaceAll("/", "-")}-${block.section}`;

/** Writes each block as a module of its own and returns the blocks by file name (with the folder of the page). */
function writeBlocks(dir, blocks) {
	const names = new Map();
	const sections = new Map();
	for (const [index, block] of blocks.entries()) {
		const key = `${block.page}#${block.section}`;
		sections.set(key, [...(sections.get(key) ?? []), { block, index }]);
	}
	// the blocks of a section go into its folder; a fork first gets the blocks of the section it began from
	const write = (page, section, folder) => {
		const parent = (sections.get(`${page}#${section}`) ??
			[])[0]?.block.parents.get(section);
		if (parent !== void 0) {
			write(page, parent, folder);
		}
		for (const { block, index } of sections.get(`${page}#${section}`) ?? []) {
			const name = join(folder, fileNameOf(block, index));
			names.set(name, block);
			mkdirSync(join(dir, folder), { recursive: true });
			// `export {}` makes the block a module, so `const bus` of two blocks do not clash
			writeFileSync(join(dir, name), `${block.code}\nexport {};\n`);
		}
	};
	for (const entries of sections.values()) {
		const { block } = entries[0];
		write(block.page, block.section, folderOf(block));
	}
	return names;
}

/** The errors to report, with the page and the line in the page. */
function errorsOf(diagnostics, names) {
	const errors = [];
	const reported = new Set();
	for (const diagnostic of diagnostics) {
		const block = names.get(diagnostic.file.split("/").slice(-2).join("/"));
		if (block && isPlainJs(block) && !isStaleName(diagnostic.message)) {
			continue;
		}
		// `line` of the block is its fence; the code starts on the next line
		const line = block ? block.line + diagnostic.line : 0;
		const page = block ? block.page : diagnostic.file;
		// a file that a fork copies is checked in each copy, and its error is one error
		const key = `${page}:${line}:${diagnostic.message}`;
		if (!reported.has(key)) {
			reported.add(key);
			errors.push({ page, line, message: diagnostic.message });
		}
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

// A translation keeps code, identifiers and strings; only comments change. These remove the comments
// so two blocks can be compared. A `#` comment counts in shell blocks only; `//` needs a space or a
// line start before it, so `https://` stays.
const shellLanguages = new Set(["bash", "sh", "shell", "zsh", "console"]);
function stripComments(block) {
	const lines = block.code.replace(/\/\*[\s\S]*?\*\//g, "").split("\n");
	return lines
		.map((line) =>
			shellLanguages.has(block.language)
				? line.replace(/(^|\s)#.*$/, "")
				: line.replace(/(^|\s)\/\/.*$/, ""),
		)
		.map((line) => line.trimEnd())
		.filter((line) => line !== "")
		.join("\n");
}

// the first line of a block can name a file (`// bus.js`): it is code, the blocks of the section import it
const fileNameLine = (block) =>
	/^\/\/ [\w-]+\.(?:jsx?|tsx?)$/.test(block.code.split("\n")[0] ?? "")
		? block.code.split("\n")[0]
		: "";

/** Compares the blocks of a translated page with the blocks of its original, in order. */
export function checkParity(original, translation) {
	const errors = [];
	const fail = (page, line, message) => errors.push({ page, line, message });
	if (original.length !== translation.length) {
		const page = translation[0]?.page ?? original[0]?.page ?? "";
		fail(
			page,
			0,
			`${translation.length} code blocks, the original has ${original.length}`,
		);
		return errors;
	}
	for (const [index, block] of original.entries()) {
		const other = translation[index];
		const where = `block ${index + 1} (${block.page}:${block.line})`;
		if (block.language !== other.language) {
			fail(
				other.page,
				other.line,
				`${where}: language ${other.language}, the original has ${block.language}`,
			);
		} else if (block.skip !== other.skip) {
			fail(
				other.page,
				other.line,
				`${where}: the docs-check skip marker differs`,
			);
		} else if (fileNameLine(block) !== fileNameLine(other)) {
			fail(other.page, other.line, `${where}: the file name comment differs`);
		} else if (stripComments(block) !== stripComments(other)) {
			fail(
				other.page,
				other.line,
				`${where}: the code differs from the original, only comments may change`,
			);
		}
	}
	return errors;
}

const readPages = (docsDir) =>
	new Map(
		readdirSync(docsDir)
			.filter((file) => file.endsWith(".md"))
			.map((file) => {
				const path = join(docsDir, file);
				return [
					file,
					extractBlocks(readFileSync(path, "utf8"), relative(root, path)),
				];
			}),
	);

/**
 * Reads every `*.md` of a folder and checks the blocks of all pages together. A `ru` folder inside
 * it holds the Russian pages: they are type-checked too, and each must match its original.
 */
export function checkDocs(docsDir, options) {
	const pages = readPages(docsDir);
	const translated = existsSync(join(docsDir, "ru"))
		? readPages(join(docsDir, "ru"))
		: new Map();
	const blocks = [...pages.values(), ...translated.values()].flat();
	const result = checkBlocks(blocks, options);
	const errors = [...result.errors];
	if (translated.size > 0) {
		for (const file of pages.keys()) {
			if (!translated.has(file)) {
				errors.push({
					page: `docs/${file}`,
					line: 0,
					message: `no Russian page docs/ru/${file}`,
				});
			}
		}
		for (const [file, translation] of translated) {
			const original = pages.get(file);
			if (original === void 0) {
				errors.push({
					page: `docs/ru/${file}`,
					line: 0,
					message: `no original page docs/${file}`,
				});
			} else {
				errors.push(...checkParity(original, translation));
			}
		}
	}
	return { ...result, errors };
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
