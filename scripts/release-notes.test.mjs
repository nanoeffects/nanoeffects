import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { absoluteLinks, releaseNotes, sectionOf } from "./release-notes.mjs";

const changelog = `# Changelog

Intro.

## 0.2.0

### Added
- New. [Docs](docs/tracing.md#a)

## 0.1.0

First release.
`;

describe("sectionOf", () => {
	it("returns the body up to the next version, and the version after it", () => {
		expect(sectionOf(changelog, "0.2.0")).toEqual({
			body: "### Added\n- New. [Docs](docs/tracing.md#a)",
			previous: "0.1.0",
		});
	});

	it("has no previous version for the first one", () => {
		expect(sectionOf(changelog, "0.1.0")).toEqual({
			body: "First release.",
			previous: void 0,
		});
	});

	it("does not take a version for another one", () => {
		expect(sectionOf(changelog, "0.2")).toBeUndefined();
		expect(sectionOf(changelog, "0.3.0")).toBeUndefined();
	});
});

describe("absoluteLinks", () => {
	it("makes the links to the repository absolute for the tag, and leaves the others", () => {
		const text =
			"[a](docs/x.md#y) [b](examples/z.ts) [c](https://example.com/docs/x) [d](#local)";

		expect(absoluteLinks(text, "v1.0.0")).toBe(
			"[a](https://github.com/nanoeffects/nanoeffects/blob/v1.0.0/docs/x.md#y) [b](https://github.com/nanoeffects/nanoeffects/blob/v1.0.0/examples/z.ts) [c](https://example.com/docs/x) [d](#local)",
		);
	});
});

describe("releaseNotes", () => {
	it("adds the link to the changes since the version before", () => {
		const notes = releaseNotes(changelog, "v0.2.0");

		expect(notes).toContain("blob/v0.2.0/docs/tracing.md#a");
		expect(notes).toContain(
			"**Full changelog**: https://github.com/nanoeffects/nanoeffects/compare/v0.1.0...v0.2.0",
		);
	});

	it("has no compare link for the first version", () => {
		expect(releaseNotes(changelog, "v0.1.0")).toBe("First release.\n");
	});

	it("fails for a version that CHANGELOG.md does not have", () => {
		expect(() => releaseNotes(changelog, "v9.9.9")).toThrow("9.9.9");
	});

	it("works for every version of the real CHANGELOG.md, with no relative link left", () => {
		const real = readFileSync(
			new URL("../CHANGELOG.md", import.meta.url),
			"utf8",
		);
		const versions = [...real.matchAll(/^## (\d+\.\d+\.\d+)$/gm)].map(
			(match) => match[1],
		);

		expect(versions.length).toBeGreaterThan(5);
		for (const version of versions) {
			const notes = releaseNotes(real, `v${version}`);

			expect(notes.length).toBeGreaterThan(30);
			expect(notes).not.toMatch(/\]\((docs|examples|skills)\//);
		}
	});
});
