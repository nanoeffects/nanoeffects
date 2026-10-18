import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		effects: "src/effects/index.ts",
		policies: "src/policies/index.ts",
		observable: "src/observable.ts",
		trace: "src/trace/index.ts",
	},
	format: ["esm"],
	platform: "neutral",
	target: "es2023",
	dts: true,
	clean: true,
	minify: true,
	treeshake: true,
	sourcemap: false,
	unused: { level: "error" },
});
