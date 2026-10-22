// Builds llms-full.txt (the summary of llms.txt plus every page it links to) and checks that
// llms.txt matches docs/ and package.json.
// `node scripts/llms-full.mjs` writes llms-full.txt; `--check` only checks.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const linkPattern = /^- \[[^\]]+\]\((docs\/[^)#]+)\)/;

/** Reads llms.txt: the summary (up to the first `## `) and the linked pages, in order. */
export function readIndex(text) {
	const lines = text.split("\n");
	const firstSection = lines.findIndex((line) => line.startsWith("## "));
	const summary = lines
		.slice(0, firstSection === -1 ? lines.length : firstSection)
		.join("\n")
		.trimEnd();
	const pages = lines.flatMap((line) => linkPattern.exec(line)?.[1] ?? []);
	return { summary, pages };
}

/** The problems of llms.txt as messages; an empty list means it is consistent. */
export function checkIndex({ text, folder, exports }) {
	const { summary, pages } = readIndex(text);
	const problems = [];
	const seen = new Set();
	for (const page of pages) {
		if (seen.has(page)) {
			problems.push(`${page} is linked twice`);
		}
		seen.add(page);
		if (!existsSync(join(folder, page))) {
			problems.push(`${page} is linked but does not exist`);
		}
	}
	const docs = readdirSync(join(folder, "docs")).filter(
		(name) => name.endsWith(".md") && name !== "README.md",
	);
	for (const name of docs) {
		if (!seen.has(`docs/${name}`)) {
			problems.push(`docs/${name} is not linked from llms.txt`);
		}
	}
	for (const path of summary.match(/nanoeffects(\/[a-z]+)?(?![\w/-])/g) ?? []) {
		const key =
			path === "nanoeffects" ? "." : `.${path.slice("nanoeffects".length)}`;
		if (!(key in exports)) {
			problems.push(`the summary names "${path}", which is not in exports`);
		}
	}
	return problems;
}

/** The summary, then each linked page under a `Source:` line. Pages are not changed. */
export function buildFull({ text, folder }) {
	const { summary, pages } = readIndex(text);
	const parts = [summary];
	for (const page of pages) {
		const body = readFileSync(join(folder, page), "utf8").trimEnd();
		parts.push(`---\nSource: ${page}\n\n${body}`);
	}
	return `${parts.join("\n\n")}\n`;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const text = readFileSync(join(root, "llms.txt"), "utf8");
	const { exports } = JSON.parse(
		readFileSync(join(root, "package.json"), "utf8"),
	);
	const problems = checkIndex({ text, folder: root, exports });
	for (const problem of problems) {
		console.error(`llms.txt: ${problem}`);
	}
	if (problems.length > 0) {
		process.exit(1);
	}
	if (process.argv.includes("--check")) {
		console.log("llms.txt: consistent with docs/ and package.json");
	} else {
		writeFileSync(
			join(root, "llms-full.txt"),
			buildFull({ text, folder: root }),
		);
		console.log("llms-full.txt written");
	}
}
