import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
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
