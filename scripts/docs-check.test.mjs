import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkBlocks, extractBlocks } from "./docs-check.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stubs = join(root, "scripts", "docs-stubs.d.ts");
const fence = "```";

const page = (...parts) => parts.join("\n");
const check = (markdown) =>
	checkBlocks(extractBlocks(markdown, "docs/test.md"), { stubs });

describe("extractBlocks", () => {
	it("finds the language, the fence line and the skip marker", () => {
		const markdown = page(
			"# Title",
			"",
			`${fence}js`,
			"const a = 1;",
			fence,
			"",
			"<!-- docs-check: skip - needs a browser -->",
			`${fence}ts`,
			"const b: number = 'x';",
			fence,
		);

		const blocks = extractBlocks(markdown, "docs/test.md");

		expect(
			blocks.map(({ language, line, skip }) => ({ language, line, skip })),
		).toEqual([
			{ language: "js", line: 3, skip: false },
			{ language: "ts", line: 8, skip: true },
		]);
		expect(blocks[0].code).toBe("const a = 1;");
	});
});

describe("checkBlocks", () => {
	it("passes a correct block", () => {
		const result = check(
			page(
				`${fence}js`,
				'import { createBus } from "nanoeffects";',
				"const bus = createBus();",
				'bus.on("greet", (name) => console.log(name));',
				'bus.emit("greet", "Ada");',
				fence,
			),
		);

		expect(result).toEqual({ errors: [], checked: 1, skipped: 0 });
	});

	it("names the page and the line of an import that no longer exists", () => {
		const result = check(
			page(
				"text",
				`${fence}js`,
				'import { createBus, removedThing } from "nanoeffects";',
				"createBus();",
				fence,
			),
		);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ page: "docs/test.md", line: 3 });
		expect(result.errors[0].message).toContain("removedThing");
	});

	it("does not share names between blocks", () => {
		const result = check(
			page(
				`${fence}js`,
				'import { createBus } from "nanoeffects";',
				"const bus = createBus();",
				fence,
				"",
				`${fence}js`,
				'bus.emit("greet", "Ada");',
				fence,
			),
		);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain("'bus'");
	});

	it("accepts a declared external name and rejects an undeclared one", () => {
		const declared = check(page(`${fence}js`, "api.search('a');", fence));
		const undeclared = check(
			page(`${fence}js`, "fetchEverything('a');", fence),
		);

		expect(declared.errors).toEqual([]);
		expect(undeclared.errors).toHaveLength(1);
		expect(undeclared.errors[0].message).toContain("fetchEverything");
	});

	it("does not report payload types of a plain js block, but does for ts", () => {
		const body = [
			'import { createBus } from "nanoeffects";',
			"const bus = createBus();",
			'bus.on("moved", ({ x }) => console.log(x));',
		];

		const js = check(page(`${fence}js`, ...body, fence));
		const ts = check(page(`${fence}ts`, ...body, fence));

		expect(js.errors).toEqual([]);
		expect(ts.errors).toHaveLength(1);
	});

	it("skips a marked block and counts it", () => {
		const result = check(
			page(
				"<!-- docs-check: skip - broken on purpose -->",
				`${fence}js`,
				"notDefined();",
				fence,
			),
		);

		expect(result).toEqual({ errors: [], checked: 0, skipped: 1 });
	});

	it("ignores fences of other languages", () => {
		const result = check(
			page(`${fence}bash`, "npm install nanoeffects", fence),
		);

		expect(result).toEqual({ errors: [], checked: 0, skipped: 0 });
	});

	it("leaves no generated files behind", () => {
		check(page(`${fence}js`, "notDefined();", fence));

		const cache = join(root, "node_modules", ".cache");
		const leftovers = existsSync(cache)
			? readdirSync(cache).filter((name) => name.startsWith("docs-check-"))
			: [];
		expect(leftovers).toEqual([]);
	});
});

describe("jsx blocks", () => {
	const component = [
		'import { useState } from "react";',
		'import { createBus } from "nanoeffects";',
		"const bus = createBus();",
		"export function Form() {",
		'  const [name, setName] = useState("");',
		'  return <form onSubmit={() => bus.emit("submit", name)}><input onChange={(event) => setName(event.target.value)} /></form>;',
		"}",
	];

	it("passes a component that imports a declared module", () => {
		const result = check(page(`${fence}jsx`, ...component, fence));

		expect(result).toEqual({ errors: [], checked: 1, skipped: 0 });
	});

	it("fails a jsx block that imports a removed export", () => {
		const result = check(
			page(
				`${fence}jsx`,
				'import { removedThing } from "nanoeffects";',
				"export const view = <p>{removedThing}</p>;",
				fence,
			),
		);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ page: "docs/test.md", line: 2 });
		expect(result.errors[0].message).toContain("removedThing");
	});

	it("fails a jsx block that imports an undeclared module", () => {
		const result = check(
			page(
				`${fence}jsx`,
				'import { thing } from "some-library";',
				"export const view = <p>{thing}</p>;",
				fence,
			),
		);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain("some-library");
	});

	it("reports a type error in a tsx block", () => {
		const result = check(
			page(
				`${fence}tsx`,
				"const count: number = 'text';",
				"export const view = <p>{count}</p>;",
				fence,
			),
		);

		expect(result.errors).toHaveLength(1);
	});
});

describe("named files", () => {
	it("lets a block import the block that names its file", () => {
		const result = check(
			page(
				`${fence}js`,
				"// helper.js",
				"export const greeting = 'hello';",
				fence,
				"",
				`${fence}js`,
				'import { greeting } from "./helper";',
				"console.log(greeting);",
				fence,
			),
		);

		expect(result).toEqual({ errors: [], checked: 2, skipped: 0 });
	});

	it("still fails an import of a file that no block names", () => {
		const result = check(
			page(`${fence}js`, 'import { greeting } from "./helper";', fence),
		);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain("./helper");
	});
});
