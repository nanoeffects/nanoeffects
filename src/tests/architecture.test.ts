import { projectFiles } from "archunit";
import { describe, expect, it } from "vitest";

// the entries are layers: the core is below all of them, and the core must not
// pull in an entry that a user does not import (see the size of `createBus`)
const aboveCore = [
	"src/actions/**",
	"src/dev/**",
	"src/effects/**",
	"src/policies/**",
	"src/store/**",
	"src/trace/**",
];

// the sources of the package: the tests import across layers on purpose
const notTests = /^(?!.*\.test\.ts$).*$/;
const sources = (folder: string) =>
	projectFiles("tsconfig.json").inFolder(folder).withName(notTests);

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
});
