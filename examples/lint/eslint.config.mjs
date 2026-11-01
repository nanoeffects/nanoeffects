// The same rule for ESLint: no new dependency, only the built-in no-restricted-syntax.
export default [
	{
		files: ["**/*.{js,jsx,ts,tsx}"],
		rules: {
			"no-restricted-syntax": [
				"warn",
				{
					// the handler is a function with fewer than two parameters: no ctx
					selector:
						"CallExpression[callee.name=/^(latest|leading|queue|debounce|throttle)$/] > :matches(ArrowFunctionExpression, FunctionExpression)[params.length<2]",
					message:
						"This handler has no ctx parameter, so it cannot pass ctx.signal to its request and cannot stop when the policy cancels it.",
				},
			],
		},
	},
];
