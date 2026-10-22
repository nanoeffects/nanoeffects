import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFull, checkIndex, readIndex } from "./llms-full.mjs";

const exports = { ".": {}, "./policies": {}, "./effects": {} };
const summary = "# pkg\n\n> A bus. Import `nanoeffects/policies` for `latest`.";
const index = (...links) =>
	`${summary}\n\n## Docs\n\n${links.map((page) => `- [${page}](${page}): about it`).join("\n")}\n`;

let folder;

beforeEach(() => {
	folder = mkdtempSync(join(tmpdir(), "llms-full-"));
	mkdirSync(join(folder, "docs"));
	writeFileSync(join(folder, "docs", "README.md"), "# For people\n");
	writeFileSync(join(folder, "docs", "guide.md"), "# Guide\n\ntext\n");
	writeFileSync(join(folder, "docs", "policies.md"), "# Policies\n");
});

afterEach(() => {
	rmSync(folder, { recursive: true, force: true });
});

describe("readIndex", () => {
	it("splits the summary from the pages and keeps their order", () => {
		const result = readIndex(index("docs/policies.md", "docs/guide.md"));

		expect(result.summary).toBe(summary);
		expect(result.pages).toEqual(["docs/policies.md", "docs/guide.md"]);
	});
});

describe("checkIndex", () => {
	const check = (text) => checkIndex({ text, folder, exports });

	it("accepts a consistent index, without docs/README.md", () => {
		expect(check(index("docs/guide.md", "docs/policies.md"))).toEqual([]);
	});

	it("names a page that is not linked", () => {
		expect(check(index("docs/guide.md"))).toEqual([
			"docs/policies.md is not linked from llms.txt",
		]);
	});

	it("names a link to a missing page", () => {
		const problems = check(
			index("docs/guide.md", "docs/policies.md", "docs/removed.md"),
		);

		expect(problems).toEqual(["docs/removed.md is linked but does not exist"]);
	});

	it("names a page linked twice", () => {
		const problems = check(
			index("docs/guide.md", "docs/policies.md", "docs/guide.md"),
		);

		expect(problems).toEqual(["docs/guide.md is linked twice"]);
	});

	it("names an entry of the summary that is not in exports", () => {
		const text = index("docs/guide.md", "docs/policies.md").replace(
			"nanoeffects/policies",
			"nanoeffects/missing",
		);

		expect(check(text)).toEqual([
			'the summary names "nanoeffects/missing", which is not in exports',
		]);
	});
});

describe("buildFull", () => {
	it("puts the summary first, then each page after its Source line, in link order", () => {
		const text = index("docs/policies.md", "docs/guide.md");

		const full = buildFull({ text, folder });

		expect(full).toBe(
			`${[
				summary,
				"---\nSource: docs/policies.md\n\n# Policies",
				"---\nSource: docs/guide.md\n\n# Guide\n\ntext",
			].join("\n\n")}\n`,
		);
	});

	it("gives the same bytes twice", () => {
		const text = index("docs/guide.md", "docs/policies.md");

		expect(buildFull({ text, folder })).toBe(buildFull({ text, folder }));
	});
});
