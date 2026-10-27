import { defineConfig } from "tsdown";

const shared = {
	format: ["esm"],
	platform: "neutral",
	target: "es2023",
	minify: true,
	treeshake: true,
	sourcemap: false,
	// react is an optional peer dependency of the `react` entry only; the other builds do not import it
	unused: { level: "error", ignore: { peerDependencies: ["react"] } },
} as const;

export default defineConfig([
	{
		...shared,
		entry: {
			index: "src/index.ts",
			effects: "src/effects/index.ts",
			policies: "src/policies/index.ts",
			observable: "src/observable.ts",
			react: "src/react/index.ts",
			trace: "src/trace/index.ts",
			actions: "src/actions/index.ts",
			redux: "src/store/redux/index.ts",
			dev: "src/dev/index.ts",
			scope: "src/scope/index.ts",
			match: "src/match/index.ts",
			signal: "src/signal/index.ts",
			oop: "src/oop/index.ts",
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
			redux: "src/store/redux/index.ts",
		},
		outDir: "dist/notrace",
		define: { __NANOEFFECTS_TRACE__: "false" },
		dts: true,
		clean: false,
	},
	{
		// `nanoeffects/dev` as it is in production: a no-op, picked with the `production` export condition
		...shared,
		entry: { dev: "src/dev/noop.ts" },
		outDir: "dist/production",
		dts: false,
		clean: false,
	},
]);
