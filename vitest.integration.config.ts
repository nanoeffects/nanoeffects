import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) =>
	fileURLToPath(new URL(`src/${path}`, import.meta.url));

// integration tests run the library together with the real Redux, Zustand,
// MobX, Jotai, Vite and webpack; they import nanoeffects as a user does
export default defineConfig({
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
		include: ["integration/**/*.test.ts"],
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});
