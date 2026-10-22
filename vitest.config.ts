import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) =>
	fileURLToPath(new URL(`src/${path}`, import.meta.url));

export default defineConfig({
	// the examples (and the tests of the guide) import nanoeffects as a user does: from the sources
	resolve: {
		alias: [
			{ find: /^nanoeffects$/, replacement: src("index.ts") },
			{ find: /^nanoeffects\/effects$/, replacement: src("effects/index.ts") },
			{
				find: /^nanoeffects\/policies$/,
				replacement: src("policies/index.ts"),
			},
			{ find: /^nanoeffects\/actions$/, replacement: src("actions/index.ts") },
			{ find: /^nanoeffects\/trace$/, replacement: src("trace/index.ts") },
			{
				find: /^nanoeffects\/redux$/,
				replacement: src("store/redux/index.ts"),
			},
			{ find: /^nanoeffects\/observable$/, replacement: src("observable.ts") },
		],
	},
	test: {
		include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
		// ArchUnitTS adds its matcher to the global `expect`
		globals: true,
	},
});
