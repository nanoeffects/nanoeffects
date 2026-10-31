import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { repositoryLink } from "./.vitepress/links";
import { ruSidebar, type SidebarItem, sidebar } from "./.vitepress/sidebar";
import { slug } from "./.vitepress/slug";

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

const flatten = (items: SidebarItem[]): SidebarItem[] =>
	items.flatMap((item) => [item, ...flatten(item.items ?? [])]);

describe.each([
	{ name: "English sidebar", tree: sidebar, folder: "", prefix: "" },
	{ name: "Russian sidebar", tree: ruSidebar, folder: "/ru", prefix: "ru/" },
])("$name", ({ tree, folder, prefix }) => {
	const docs = fileURLToPath(new URL(`../../docs${folder}`, import.meta.url));
	const pages = readdirSync(docs)
		.filter((name) => name.endsWith(".md") && name !== "README.md")
		.map((name) => name.slice(0, -3))
		.sort();
	const links = flatten(tree).flatMap((item) => (item.link ? [item.link] : []));
	const linked = links
		.filter((link) => !link.includes("#"))
		.map((link) => link.slice(1 + prefix.length));

	it("lists every page of docs", () => {
		expect(pages.filter((page) => !linked.includes(page))).toEqual([]);
	});

	it("names no page that does not exist", () => {
		expect(linked.filter((page) => !pages.includes(page))).toEqual([]);
	});

	it("lists a page once", () => {
		expect(new Set(linked).size).toBe(linked.length);
	});

	it("points every nested link at a heading of its page", () => {
		const missing = links
			.filter((link) => link.includes("#"))
			.filter((link) => {
				const [page = "", anchor = ""] = link
					.slice(1 + prefix.length)
					.split("#");
				const text = readFileSync(`${docs}/${page}.md`, "utf8").replace(
					/```[\s\S]*?```/g,
					"",
				);
				const headings = [...text.matchAll(/^#{1,6} (.*)$/gm)].map((match) =>
					slug(match[1] ?? ""),
				);
				return !headings.includes(anchor);
			});
		expect(missing).toEqual([]);
	});
});

const docsFolder = fileURLToPath(new URL("../../docs", import.meta.url));

const pagesOf = (folder: string) =>
	readdirSync(folder)
		.filter((name) => name.endsWith(".md"))
		.map((name) => `${folder}/${name}`);

const headingsOf = (path: string) => {
	const text = readFileSync(path, "utf8").replace(/```[\s\S]*?```/g, "");
	return [...text.matchAll(/^#{1,6} (.*)$/gm)].map((match) =>
		slug(match[1] ?? ""),
	);
};

describe("links to a heading", () => {
	const pages = [...pagesOf(docsFolder), ...pagesOf(`${docsFolder}/ru`)];

	it("point at a heading that exists", () => {
		const broken: string[] = [];
		for (const page of pages) {
			const text = readFileSync(page, "utf8").replace(/```[\s\S]*?```/g, "");
			for (const match of text.matchAll(/\]\(([\w-]*\.md)?#([^)\s]+)\)/g)) {
				const target = match[1]
					? `${page.slice(0, page.lastIndexOf("/"))}/${match[1]}`
					: page;
				if (!headingsOf(target).includes(match[2] ?? "")) {
					broken.push(`${page.replace(docsFolder, "docs")}: ${match[0]}`);
				}
			}
		}
		expect(broken).toEqual([]);
	});
});
