import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The Biome rule of examples/lint flags a handler of a policy that has no ctx parameter, and nothing else.

const folder = join(process.cwd(), "examples/lint");
const biome = join(process.cwd(), "node_modules/.bin/biome");

const flaggedLines = () => {
	// Biome writes its diagnostics to stderr or stdout depending on the version; read both
	const run = spawnSync(biome, ["lint", "--max-diagnostics=50", "fixture.ts"], {
		cwd: folder,
		encoding: "utf8",
	});
	const output = `${run.stdout}${run.stderr}`;

	return [...output.matchAll(/fixture\.ts:(\d+):\d+/g)].map((match) =>
		Number(match[1]),
	);
};

describe("examples/lint", () => {
	it("the Biome rule flags the four handlers with no ctx, and not the others", () => {
		expect(flaggedLines()).toEqual([9, 10, 11, 12]);
	});
});
