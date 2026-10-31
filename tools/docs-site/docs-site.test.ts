import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { repositoryLink } from "./.vitepress/links";
import { sidebar } from "./.vitepress/sidebar";

const repository = "https://github.com/nanoeffects/nanoeffects";

describe("repositoryLink", () => {
	it("sends a file outside docs to the repository", () => {
		expect(repositoryLink("../README.md", "guide.md")).toBe(
			`${repository}/blob/main/README.md`,
		);
		expect(repositoryLink("../CHANGELOG.md", "stability.md")).toBe(
			`${repository}/blob/main/CHANGELOG.md`,
		);
		expect(repositoryLink("../examples/guide.ts", "guide.md")).toBe(
			`${repository}/blob/main/examples/guide.ts`,
		);
	});

	it("sends a directory outside docs to tree", () => {
		expect(repositoryLink("../examples/counter", "guide.md")).toBe(
			`${repository}/tree/main/examples/counter`,
		);
	});

	it("keeps the hash", () => {
		expect(repositoryLink("../README.md#install", "guide.md")).toBe(
			`${repository}/blob/main/README.md#install`,
		);
	});

	it("leaves links inside docs, anchors and external links alone", () => {
		expect(repositoryLink("policies.md#latest", "guide.md")).toBe(
			"policies.md#latest",
		);
		expect(repositoryLink("#top", "guide.md")).toBe("#top");
		expect(repositoryLink("https://example.com/a", "guide.md")).toBe(
			"https://example.com/a",
		);
	});
});

describe("sidebar", () => {
	const docs = fileURLToPath(new URL("../../docs", import.meta.url));
	const pages = readdirSync(docs)
		.filter((name) => name.endsWith(".md") && name !== "README.md")
		.map((name) => name.slice(0, -3))
		.sort();
	const linked = sidebar
		.flatMap((group) => group.items)
		.map((item) => item.link.slice(1));

	it("lists every page of docs", () => {
		expect(pages.filter((page) => !linked.includes(page))).toEqual([]);
	});

	it("names no page that does not exist", () => {
		expect(linked.filter((page) => !pages.includes(page))).toEqual([]);
	});

	it("lists a page once", () => {
		expect(new Set(linked).size).toBe(linked.length);
	});
});
