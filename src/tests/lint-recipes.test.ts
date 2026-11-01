import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "acorn";
import { describe, expect, it } from "vitest";

// The lint recipes of examples/lint flag a handler of a policy that has no ctx parameter, or takes ctx and loses
// the signal, and nothing else. Biome runs its GritQL rules on the fixture; the ESLint/oxlint rule, which is one
// plain function over the syntax tree, runs on the same fixture parsed by acorn.

const folder = join(process.cwd(), "examples/lint");
const biome = join(process.cwd(), "node_modules/.bin/biome");
// lines of fixture.js: the first four have no ctx, the next three take ctx and lose the signal
const flagged = [4, 5, 6, 7, 12, 16, 19];

const biomeLines = () => {
	// Biome writes its diagnostics to stderr or stdout depending on the version; read both
	const run = spawnSync(biome, ["lint", "--max-diagnostics=50", "fixture.js"], {
		cwd: folder,
		encoding: "utf8",
	});
	const output = `${run.stdout}${run.stderr}`;

	return [...output.matchAll(/fixture\.js:(\d+):\d+/g)].map((match) =>
		Number(match[1]),
	);
};

type Report = { node: { loc: { start: { line: number } } }; messageId: string };

const ruleLines = async () => {
	const { default: plugin } = (await import(
		join(folder, "nanoeffects-lint.mjs")
	)) as {
		default: {
			rules: Record<
				string,
				{
					create: (context: unknown) => Record<string, (node: unknown) => void>;
				}
			>;
		};
	};
	const rule = plugin.rules["policy-handler-uses-signal"];
	const source = readFileSync(join(folder, "fixture.js"), "utf8");
	const program = parse(source, {
		ecmaVersion: "latest",
		sourceType: "module",
		locations: true,
	});
	const reports: Report[] = [];
	const visitor =
		rule?.create({ report: (report: Report) => reports.push(report) }) ?? {};

	const walk = (node: unknown) => {
		if (!node || typeof node !== "object") {
			return;
		}
		const typed = node as { type?: string };
		if (typed.type === "CallExpression") {
			visitor.CallExpression?.(node);
		}
		for (const child of Object.values(node)) {
			if (Array.isArray(child)) {
				child.forEach(walk);
			} else {
				walk(child);
			}
		}
	};
	walk(program);

	return reports.map((report) => report.node.loc.start.line);
};

describe("examples/lint", () => {
	it("the Biome rules flag the handlers with no ctx and the ones that lose the signal", () => {
		expect(biomeLines()).toEqual(flagged);
	});

	it("the ESLint and oxlint rule flags the same handlers", async () => {
		expect(await ruleLines()).toEqual(flagged);
	});
});
