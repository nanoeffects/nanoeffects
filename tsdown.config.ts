import { defineConfig } from "tsdown";

const shared = {
	format: ["esm"],
	platform: "neutral",
	target: "es2023",
	minify: true,
	treeshake: true,
	sourcemap: false,
	unused: { level: "error" },
} as const;

export default defineConfig([
	{
		...shared,
		entry: {
			index: "src/index.ts",
			effects: "src/effects/index.ts",
			policies: "src/policies/index.ts",
			observable: "src/observable.ts",
			trace: "src/trace/index.ts",
			actions: "src/actions/index.ts",
		},
		dts: true,
		clean: true,
	},
	{
		// the same code without the tracing hooks, picked with the `notrace` export condition
		...shared,
		entry: {
			index: "src/index.ts",
			effects: "src/effects/index.ts",
			policies: "src/policies/index.ts",
			actions: "src/actions/index.ts",
		},
		outDir: "dist/notrace",
		define: { __NANOEFFECTS_TRACE__: "false" },
		dts: true,
		clean: false,
	},
]);
