// A lint rule for the handler of a policy (latest, leading, queue, debounce, throttle) that loses the signal.
//
// A policy cancels an older call by aborting `ctx.signal`. A handler can only stop when it passes the signal on:
// to `fetch(url, { signal })`, or the whole `ctx` to an effect (`retry(ctx, ...)`), or through `ctx.run`.
// The rule reports a handler written in place that
//   - has no ctx parameter at all, or
//   - takes ctx but never passes the signal on: ctx is unused, or used only for `ctx.emit`, `ctx.on` and the like.
//
// It is an ordinary ESLint rule with no dependency, so it works in ESLint and in oxlint (as a JS plugin).
// It reads handlers written in place; `latest(namedHandler)` is not checked. It walks the syntax tree on its
// own and does not use scope analysis, so a ctx that is shadowed by an inner variable can hide a lost signal.

const policies = new Set(["latest", "leading", "queue", "debounce", "throttle"]);
// the first argument of these is a number of ms, so the handler is the second one
const timed = new Set(["debounce", "throttle"]);
// members of ctx that do not carry the signal
const without = new Set(["emit", "on", "off", "type", "payload"]);
const skipped = new Set(["parent", "loc", "range", "start", "end", "tokens", "comments"]);

const isFunction = (node) =>
	node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

const walk = (node, visit, parent = null) => {
	if (!node || typeof node.type !== "string") {
		return;
	}
	visit(node, parent);
	for (const key of Object.keys(node)) {
		if (skipped.has(key)) {
			continue;
		}
		const child = node[key];
		if (Array.isArray(child)) {
			for (const item of child) {
				walk(item, visit, node);
			}
		} else if (child && typeof child === "object") {
			walk(child, visit, node);
		}
	}
};

// ({ emit }) or ({ emit, on }): a pattern that takes only members that do not carry the signal
const patternLosesSignal = (pattern) =>
	pattern.properties.every(
		(property) =>
			property.type === "Property" &&
			!property.computed &&
			property.key.type === "Identifier" &&
			without.has(property.key.name),
	);

// ctx: every use of the name is one of `ctx.emit`, `ctx.on` and the like, or there is none
const nameLosesSignal = (name, body) => {
	let carries = false;
	walk(body, (node, parent) => {
		if (carries || node.type !== "Identifier" || node.name !== name) {
			return;
		}
		const isKey =
			(parent?.type === "MemberExpression" && parent.property === node && !parent.computed) ||
			(parent?.type === "Property" && parent.key === node && !parent.computed && !parent.shorthand);
		if (isKey) {
			return;
		}
		const isSafeMember =
			parent?.type === "MemberExpression" &&
			parent.object === node &&
			!parent.computed &&
			parent.property.type === "Identifier" &&
			without.has(parent.property.name);
		if (!isSafeMember) {
			carries = true;
		}
	});

	return !carries;
};

const lostSignal = (fn) => {
	const ctx = fn.params[1];
	if (ctx.type === "ObjectPattern") {
		return patternLosesSignal(ctx);
	}
	if (ctx.type === "Identifier") {
		return nameLosesSignal(ctx.name, fn.body);
	}

	return false;
};

const rule = {
	meta: {
		type: "problem",
		schema: [],
		messages: {
			noContext:
				"This handler has no ctx parameter, so it cannot pass ctx.signal to its request and cannot stop when the policy cancels it. Add (value, ctx) and pass ctx.signal on.",
			lostSignal:
				"This handler takes ctx but never passes the signal on (ctx is unused, or used only for emit and on), so it keeps running after the policy cancels it. Pass ctx.signal to the request, or ctx to an effect.",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				if (node.callee.type !== "Identifier" || !policies.has(node.callee.name)) {
					return;
				}
				const handler = node.arguments[timed.has(node.callee.name) ? 1 : 0];
				if (!isFunction(handler)) {
					return;
				}
				if (handler.params.length < 2) {
					context.report({ node: handler, messageId: "noContext" });
				} else if (lostSignal(handler)) {
					context.report({ node: handler, messageId: "lostSignal" });
				}
			},
		};
	},
};

export default {
	meta: { name: "nanoeffects" },
	rules: { "policy-handler-uses-signal": rule },
};
