import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectFiles } from "archunit";
import { describe, expect, it } from "vitest";

// the entries are layers: the core is below all of them, and the core must not
// pull in an entry that a user does not import (see the size of `createBus`)
const aboveCore = [
	"src/actions/**",
	"src/context/**",
	"src/dev/**",
	"src/effects/**",
	"src/policies/**",
	"src/react/**",
	"src/store/**",
	"src/svelte/**",
	"src/trace/**",
	"src/vue/**",
];

// the sources of the package: the tests import across layers on purpose
const notTests = /^(?!.*\.test\.ts$).*$/;
const sources = (folder: string) =>
	projectFiles("tsconfig.json").inFolder(folder).withName(notTests);

// The big examples are split into layers that import downwards only: `shared`, `entities`,
// `features`, then `ui` (with `app.ts` and `main.tsx`) on top. An entity imports `shared` only, a
// feature imports `shared` and entities, and no unit imports a unit of its own layer.
const unitsOf = (root: string, layer: string) =>
	readdirSync(join(root, layer), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

type Forbidden = { from: string; to: string };

const forbiddenImports = (root: string): Forbidden[] => {
	const entities = unitsOf(root, "entities").map((name) => `entities/${name}`);
	const features = unitsOf(root, "features").map((name) => `features/${name}`);
	const forbidden: Forbidden[] = [];

	for (const entity of entities) {
		const others = [
			...entities.filter((other) => other !== entity),
			"features",
		];
		for (const to of [...others, "ui"]) {
			forbidden.push({ from: entity, to });
		}
	}
	for (const feature of features) {
		const others = features.filter((other) => other !== feature);
		for (const to of [...others, "ui"]) {
			forbidden.push({ from: feature, to });
		}
	}
	for (const to of ["entities", "features", "ui"]) {
		forbidden.push({ from: "shared", to });
	}

	return forbidden;
};

// every import that the layers forbid, as "from -> to" for the folders involved
const layerViolations = async (root: string) => {
	const found: string[] = [];

	for (const { from, to } of forbiddenImports(root)) {
		const violations = await sources(`${root}/${from}/**`)
			.shouldNot()
			.dependOnFiles()
			.inFolder(`${root}/${to}/**`)
			.check();
		if (violations.length > 0) {
			found.push(`${from} -> ${to}`);
		}
	}

	return found;
};

describe("architecture", () => {
	// the core itself has cycles between its type files (`types.ts` names `bus.ts` and the other way round);
	// they exist only in the types, so the check is for the layers above it
	it("the layers above the core have no import cycles", async () => {
		const violations = await sources("src/!(core|tests)/**")
			.should()
			.haveNoCycles()
			.check();

		expect(violations).toEqual([]);
	});

	for (const folder of aboveCore) {
		it(`the core does not depend on ${folder}`, async () => {
			const violations = await sources("src/core/**")
				.shouldNot()
				.dependOnFiles()
				.inFolder(folder)
				.check();

			expect(violations).toEqual([]);
		});
	}

	// `react`, `svelte` and `vue` are optional peer dependencies: only their own entries may import them
	for (const [folder, pattern] of [
		["react", /from "react(-dom)?(\/|")/],
		["svelte", /from "svelte(\/|")/],
		["vue", /from "vue(\/|")/],
	] as const) {
		it(`only src/${folder} imports ${folder}`, () => {
			const importers = readdirSync("src", {
				recursive: true,
				encoding: "utf8",
			})
				.filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
				.filter((file) => !file.startsWith(join(folder, "")))
				.filter((file) =>
					pattern.test(readFileSync(join("src", file), "utf8")),
				);

			expect(importers).toEqual([]);
		});
	}

	for (const root of ["examples/chat/src", "examples/pokedex/src"]) {
		it(`${root} imports downwards only: shared, entities, features, then the top`, async () => {
			expect(await layerViolations(root)).toEqual([]);
		});
	}

	it("the layer rules find an entity that imports another entity and a feature that imports another feature", async () => {
		expect(await layerViolations("src/tests/fixtures/layers")).toEqual([
			"entities/second -> entities/first",
			"features/two -> features/one",
		]);
	});
});
