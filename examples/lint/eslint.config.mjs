import nanoeffects from "./nanoeffects-lint.mjs";

// The rule works in ESLint with no other plugin. Add `files` and the parser your project already uses.
export default [
	{
		files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
		plugins: { nanoeffects },
		rules: {
			"nanoeffects/policy-handler-uses-signal": "warn",
		},
	},
];
