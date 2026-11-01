// A lint rule for the handler of a policy (latest, leading, queue, debounce, throttle) that loses the signal.
//
// A policy cancels an older call by aborting `ctx.signal`. A handler stops only when every step that waits
// gets the signal: `fetch(url, { signal })`, `api.posts(query, { signal })`, a `{ signal }` options object kept
// in a variable, or the whole `ctx` for an effect (`retry(ctx, ...)`). For a handler written in place the rule
// reports
//   - a handler with no ctx parameter, and
//   - each step of a handler with ctx that does not pass the signal on, also when another step does, and
//   - a `bus.emit(...)` inside the handler: unlike `ctx.emit`, it is not dropped after the handler was cancelled,
//     so a stale call still delivers its result.
//
// A step is a call that the handler waits for: `await call`, `return call`, the body of an arrow that is a call,
// `for await (x of call)`, and `await new Promise(...)`. The rule looks inside what runs the steps:
//   - `Promise.all([...])`, `allSettled`, `race`, `any`, also with `items.map(...)`: each call is a step;
//   - the callbacks of effects (`retry`, `timeout`, `poll`, `all`, `race`, `take`) and of `ctx.run`: the steps
//     inside a callback need the signal too, from `ctx.signal` or from the child context the callback gets.
//
// A step is not reported when it is a call on ctx (`ctx.emit`), reads the body of a response (`.json()`: the
// signal of the request covers it), matches `ignore` (see below), or carries the signal anywhere in its
// arguments: an identifier `signal`, `ctx.signal`, a name that was set from them (`const options = { signal }`),
// or `ctx` itself as an argument. A handler that wires the signal by hand (`signal.addEventListener("abort", ...)`
// or `onAbort(ctx, ...)`) is not checked step by step.
//
// Two options choose which calls are checked, by the name of the callee (`api.search`, `fetch`):
//   - `ignore`: calls that cannot be cancelled and are fine to wait for, such as `["cache.get", "db.*"]` (a list
//     of what to skip);
//   - `only`: the calls that take a signal, such as `["api.*", "fetch"]` (a list of what to check). Anything else
//     is left alone. With `only` set, a call that is not on the list is never reported.
// A trailing `*` matches any name after the dot. A call that matches both lists is skipped. To silence one line
// use the disable comment of your linter.
//
//
// With type information (typescript-eslint with a program) the rule also reads the function it calls:
//   - a call that does not get the signal is reported only when the function takes one (a parameter of type
//     `AbortSignal`, or an options object with `signal`). A function that takes none, such as `cache.get(key)`,
//     cannot be cancelled and is left alone, so `ignore` is rarely needed. A function whose type is unknown (`any`)
//     is reported as before.
//   - a call that does get the signal is reported when the function is in your sources and never uses it: the
//     parameter is unused, or only other options are read from it. A function from a library (a `.d.ts` file) is
//     trusted. A signal that is forwarded to another function of yours is followed, up to three calls deep.
// Without type information (oxlint, or ESLint with no program) only the syntax is read.
// It is an ordinary ESLint rule with no dependency, so it works in ESLint and in oxlint (as a JS plugin).
// It reads handlers written in place; `latest(namedHandler)` and `latest(withLogging(async ...))` are not
// checked. It walks the syntax tree on its own and does not use scope analysis. It cannot know whether a callee
// accepts a signal, so a call that cannot be cancelled is reported unless it matches `ignore`.

import { createRequire } from "node:module";

const policies = new Set(["latest", "leading", "queue", "debounce", "throttle"]);
// the first argument of these is a number of ms, so the handler is the second one
const timed = new Set(["debounce", "throttle"]);
// effects that take ctx first and run callbacks; the callbacks get a child context
const effects = new Set(["retry", "timeout", "poll", "all", "allSettled", "race", "take"]);
const combinators = new Set(["all", "allSettled", "race", "any"]);
const skipped = new Set(["parent", "loc", "range", "start", "end", "tokens", "comments"]);
// reading the body of a response is stopped by the signal of the request
const bodyReaders = new Set(["json", "text", "blob", "arrayBuffer", "formData", "clone"]);

const isFunction = (node) =>
	node?.type === "ArrowFunctionExpression" ||
	node?.type === "FunctionExpression" ||
	node?.type === "FunctionDeclaration";

const children = (node) => {
	const found = [];
	for (const key of Object.keys(node)) {
		if (skipped.has(key)) {
			continue;
		}
		const child = node[key];
		if (Array.isArray(child)) {
			found.push(...child.filter((item) => item && typeof item.type === "string"));
		} else if (child && typeof child.type === "string") {
			found.push(child);
		}
	}

	return found;
};

// visits the nodes of a handler body, not entering a function inside it
const walk = (node, visit, parent = null, root = true) => {
	if (!node || typeof node.type !== "string") {
		return;
	}
	visit(node, parent);
	if (!root && isFunction(node)) {
		return;
	}
	for (const child of children(node)) {
		walk(child, visit, node, false);
	}
};

// visits every node of a subtree, also inside functions: a callback in the arguments can carry the signal
const walkAll = (node, visit, parent = null) => {
	if (!node || typeof node.type !== "string") {
		return;
	}
	visit(node, parent);
	for (const child of children(node)) {
		walkAll(child, visit, node);
	}
};

const unwrap = (node) => {
	let current = node;
	while (current && (current.type === "ChainExpression" || current.type === "AwaitExpression")) {
		current = current.type === "ChainExpression" ? current.expression : current.argument;
	}

	return current;
};

const isMember = (node, object, property) =>
	node?.type === "MemberExpression" &&
	!node.computed &&
	node.object.type === "Identifier" &&
	node.object.name === object &&
	node.property.type === "Identifier" &&
	node.property.name === property;

// "api.search", "cache.get", "fetch": the text of a callee made of names, else ""
const calleeText = (callee) => {
	if (callee.type === "Identifier") {
		return callee.name;
	}
	if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
		const object = calleeText(callee.object);

		return object === "" ? "" : `${object}.${callee.property.name}`;
	}

	return "";
};

const matches = (text, patterns) =>
	text !== "" &&
	patterns.some((pattern) =>
		pattern.endsWith("*") ? text.startsWith(pattern.slice(0, -1)) : text === pattern,
	);

// the signal names of an ObjectPattern: `{ signal }` and `{ signal: own }`
const signalsOfPattern = (pattern, into) => {
	for (const property of pattern.properties) {
		const isSignal = property.type === "Property" && property.key?.name === "signal";
		if (isSignal && property.value.type === "Identifier") {
			into.add(property.value.name);
		}
	}
};

// takes the parameters of a function (a handler or a callback of an effect) into the names
const withParameters = (names, fn, from) => {
	const signals = new Set(names.signals);
	const contexts = new Set(names.contexts);
	for (const parameter of fn.params.slice(from)) {
		if (parameter.type === "Identifier") {
			contexts.add(parameter.name);
		} else if (parameter.type === "ObjectPattern") {
			signalsOfPattern(parameter, signals);
		}
	}

	return { signals, contexts };
};

// does anything in this call pass the signal on?
const carriesSignal = (call, { signals, contexts }) => {
	let carries = false;
	walkAll(call, (node, parent) => {
		if (carries || node.type !== "Identifier") {
			return;
		}
		if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) {
			return;
		}
		// the key of `{ signal: value }` is a name, not the signal; the value decides
		if (parent?.type === "Property" && parent.key === node && parent.value !== node && !parent.computed) {
			return;
		}
		if (signals.has(node.name)) {
			carries = true;
		} else if (contexts.has(node.name)) {
			// ctx.signal, or ctx given to a call, spread, or put in an object: not ctx.type or ctx.payload
			const asSignal =
				parent?.type === "MemberExpression" && parent.object === node && parent.property.name === "signal";
			const asValue =
				(parent?.type === "CallExpression" && parent.arguments.includes(node)) ||
				parent?.type === "SpreadElement" ||
				(parent?.type === "Property" && parent.value === node);
			carries = asSignal || asValue;
		}
	});

	return carries;
};

// the names that mean the signal or the context inside a function, with aliases set in its body
const namesOf = (fn, outer, from) => {
	const names = withParameters(outer, fn, from);
	walk(
		fn.body,
		(node) => {
			if (node.type !== "VariableDeclarator" || !node.init) {
				return;
			}
			const init = unwrap(node.init);
			if (node.id.type === "ObjectPattern") {
				if (init?.type === "Identifier" && names.contexts.has(init.name)) {
					signalsOfPattern(node.id, names.signals);
				}

				return;
			}
			if (node.id.type !== "Identifier") {
				return;
			}
			if (init?.type === "Identifier" && names.contexts.has(init.name)) {
				names.contexts.add(node.id.name);
			} else if (carriesSignal(init, names)) {
				// const own = ctx.signal;  const options = { signal };  const options = { ...base, signal: own }
				names.signals.add(node.id.name);
			}
		},
		null,
		true,
	);

	return names;
};

// a handler that wires the signal by hand does not need every step to get it
const wiresByHand = (fn, { signals, contexts }) => {
	let wired = false;
	walk(
		fn.body,
		(node) => {
			if (node.type !== "CallExpression") {
				return;
			}
			const callee = node.callee;
			const onSignal =
				callee.type === "MemberExpression" &&
				callee.property.name === "addEventListener" &&
				callee.object.type === "Identifier" &&
				signals.has(callee.object.name);
			const onAbort =
				callee.type === "Identifier" &&
				callee.name === "onAbort" &&
				node.arguments.some((argument) => argument.type === "Identifier" && contexts.has(argument.name));
			wired = wired || onSignal || onAbort;
		},
		null,
		true,
	);

	return wired;
};

// the calls a function waits for: `await call`, `return call`, `for await (x of call)`, an arrow body that is a call
const stepsOf = (fn) => {
	const steps = new Set();
	const take = (expression) => {
		const call = unwrap(expression);
		const isPromise = call?.type === "NewExpression" && call.callee.name === "Promise";
		if (call?.type === "CallExpression" || isPromise) {
			steps.add(call);
		}
	};
	if (fn.body.type !== "BlockStatement") {
		take(fn.body);
	}
	walk(
		fn.body,
		(node) => {
			if (node.type === "AwaitExpression" || node.type === "ReturnStatement") {
				take(node.argument);
			}
			if (node.type === "ForOfStatement" && node.await) {
				take(node.right);
			}
		},
		null,
		true,
	);

	return [...steps];
};

const isContextArgument = (call, contexts) =>
	call.arguments[0]?.type === "Identifier" && contexts.has(call.arguments[0].name);

// a call that runs callbacks with a child context: retry(ctx, ...), timeout(ctx, ...), ctx.run(...)
const isEffectCall = (call, { contexts }) => {
	const callee = call.callee;
	if (callee.type === "Identifier") {
		return effects.has(callee.name) && isContextArgument(call, contexts);
	}

	return (
		callee.type === "MemberExpression" &&
		callee.object.type === "Identifier" &&
		contexts.has(callee.object.name) &&
		callee.property.name === "run"
	);
};

// Promise.all / allSettled / race / any: the calls of the array are the steps
const isCombinator = (call) =>
	call.callee.type === "MemberExpression" &&
	call.callee.object.type === "Identifier" &&
	call.callee.object.name === "Promise" &&
	combinators.has(call.callee.property.name);

// the callbacks that an effect or a combinator runs: functions given directly, in an array, or in an object
const callbacksOf = (call) => {
	const found = [];
	const visit = (node) => {
		if (isFunction(node)) {
			found.push(node);
		} else if (node?.type === "ArrayExpression") {
			node.elements.forEach(visit);
		} else if (node?.type === "ObjectExpression") {
			node.properties.forEach((property) => visit(property.value));
		}
	};
	call.arguments.forEach(visit);

	return found;
};

// is a call on ctx itself (ctx.emit) or a read of a response body: no signal of its own is needed
const isExempt = (call, { contexts }, ignore) => {
	if (matches(calleeText(call.callee), ignore)) {
		return true;
	}
	const callee = call.callee;
	if (callee?.type !== "MemberExpression") {
		return false;
	}
	let root = callee;
	while (root.type === "MemberExpression") {
		root = root.object;
	}
	const onContext = root.type === "Identifier" && contexts.has(root.name);
	const reads = !callee.computed && callee.property.type === "Identifier" && bodyReaders.has(callee.property.name);

	return onContext || reads;
};


// ---- type information -------------------------------------------------------------------------------------------

const nodeRequire = createRequire(import.meta.url);

// the TypeScript package of the project, if it has the compiler API (typescript 7 has none)
const loadTypeScript = () => {
	try {
		const ts = nodeRequire("typescript");

		return typeof ts.createProgram === "function" ? ts : null;
	} catch {
		return null;
	}
};

// does a type carry a signal? "yes": an AbortSignal, or an object with a `signal` member; "unknown": any
const typeCarries = (ts, type) => {
	if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
		return "unknown";
	}
	if (type.isUnion() || type.isIntersection()) {
		const results = type.types.map((member) => typeCarries(ts, member));
		if (results.includes("yes")) {
			return "yes";
		}

		return results.includes("unknown") ? "unknown" : "no";
	}
	if (type.getSymbol()?.getName() === "AbortSignal" || type.getProperty("signal")) {
		return "yes";
	}

	return "no";
};

// the type is an AbortSignal (or an AbortSignal that may be undefined), not an object that has one
const isAbortSignal = (ts, type) => {
	if (type.isUnion()) {
		const members = type.types.filter((member) => !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));

		return members.length > 0 && members.every((member) => isAbortSignal(ts, member));
	}

	return type.getSymbol()?.getName() === "AbortSignal";
};

const identifiersNamed = (ts, root, name) => {
	const found = [];
	const visit = (node) => {
		if (ts.isIdentifier(node) && node.text === name) {
			found.push(node);
		}
		ts.forEachChild(node, visit);
	};
	visit(root);

	return found;
};

// the declaration of a function that is in your sources, with a body to read
const readableDeclaration = (ts, program, signature) => {
	const declaration = signature?.declaration;
	const file = declaration?.getSourceFile();
	const readable =
		declaration &&
		ts.isFunctionLike(declaration) &&
		declaration.body &&
		!file.isDeclarationFile &&
		!program.isSourceFileFromExternalLibrary(file);

	return readable ? declaration : null;
};

// How a function uses the parameter that receives the signal: "uses", "ignores", or "unknown".
const parameterUsage = (ts, program, checker, parameter, body, depth) => {
	const name = parameter.name;
	if (ts.isObjectBindingPattern(name)) {
		const element = name.elements.find(
			(item) => (item.propertyName ?? item.name).text === "signal" || item.dotDotDotToken,
		);
		if (!element || !ts.isIdentifier(element.name)) {
			return "ignores";
		}

		return identifiersNamed(ts, body, element.name.text).length > 0 ? "uses" : "ignores";
	}
	if (!ts.isIdentifier(name)) {
		return "unknown";
	}
	const isSignalItself = isAbortSignal(ts, checker.getTypeAtLocation(parameter));
	for (const reference of identifiersNamed(ts, body, name.text)) {
		const parent = reference.parent;
		if (isSignalItself) {
			return "uses";
		}
		if (ts.isPropertyAccessExpression(parent) && parent.expression === reference) {
			if (parent.name.text === "signal") {
				return "uses";
			}
			continue;
		}
		if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(reference)) {
			if (forwardedUsage(ts, program, checker, parent, parent.arguments.indexOf(reference), depth) !== "ignores") {
				return "uses";
			}
			continue;
		}
		if (ts.isPropertyAssignment(parent) && parent.name === reference) {
			continue;
		}
		// a spread, an alias, a return, an element access: the signal can go anywhere, so trust it
		return "uses";
	}

	return "ignores";
};

// the signal goes to argument `index` of another call: follow it into the function when it is in your sources
const forwardedUsage = (ts, program, checker, call, index, depth) => {
	if (depth >= 3) {
		return "unknown";
	}
	const signature = checker.getResolvedSignature(call);
	const declaration = readableDeclaration(ts, program, signature);
	const parameter = declaration?.parameters[index];
	if (!parameter) {
		return "unknown";
	}

	return parameterUsage(ts, program, checker, parameter, declaration.body, depth + 1);
};

// the answers of the type checker about a call, for the rule
const typeProvider = (context, carriesIn) => {
	const services = context.sourceCode?.parserServices ?? context.parserServices;
	const ts = context.settings?.nanoeffects?.typescript ?? loadTypeScript();
	if (!ts || !services?.program || !services.esTreeNodeToTSNodeMap) {
		return null;
	}
	const program = services.program;
	const checker = program.getTypeChecker();
	const tsNodeOf = (node) => services.esTreeNodeToTSNodeMap.get(node);

	return {
		// does the function take a signal? "yes", "no", or "unknown" when the types do not say
		accepts(call) {
			const tsCall = tsNodeOf(call);
			const signature = tsCall ? checker.getResolvedSignature(tsCall) : null;
			if (!signature?.declaration) {
				return "unknown";
			}
			let answer = "no";
			for (const parameter of signature.getParameters()) {
				const type = checker.getTypeOfSymbolAtLocation(parameter, tsCall);
				const isRest = parameter.valueDeclaration?.dotDotDotToken;
				const result = typeCarries(ts, isRest ? (checker.getIndexTypeOfType(type, ts.IndexKind.Number) ?? type) : type);
				if (result === "yes") {
					return "yes";
				}
				answer = result === "unknown" ? "unknown" : answer;
			}

			return answer;
		},
		// does the function use the signal it gets? "ignores" only when it is in your sources and never uses it
		usage(call, names) {
			const tsCall = tsNodeOf(call);
			const index = call.arguments.findIndex((argument) => carriesIn(argument, names));
			if (!tsCall || index < 0) {
				return "unknown";
			}

			return forwardedUsage(ts, program, checker, tsCall, index, 0);
		},
	};
};

const rule = {
	meta: {
		type: "problem",
		schema: [
			{
				type: "object",
				properties: {
					ignore: { type: "array", items: { type: "string" } },
					only: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		messages: {
			noContext:
				"This handler has no ctx parameter, so it cannot pass ctx.signal to its request and cannot stop when the policy cancels it. Add (value, ctx) and pass ctx.signal on.",
			lostSignal:
				"This step waits for a call that does not get the signal, so it keeps running after the policy cancels the handler. Pass { signal: ctx.signal } to it, or ctx to an effect.",
			ignoredSignal:
				"This call gets the signal, but the function never uses it, so the request is not cancelled. Pass the signal on inside the function: fetch(url, { signal }).",
			staleEmit:
				"This emit is not dropped when the policy cancels the handler, so a stale call still delivers its result. Use ctx.emit.",
			lostWait:
				"This step waits for a promise that nothing can cancel, so the handler keeps waiting after the policy cancels it. Listen to the signal in it, or use delay(ctx, ms).",
		},
	},
	create(context) {
		const options = context.options?.[0] ?? {};
		const ignore = options.ignore ?? [];
		const only = options.only ?? [];
		// with `only`, a call is checked when its name is on the list; a name that cannot be read is not
		const isChecked = (call) =>
			only.length === 0 || call.type === "NewExpression" || matches(calleeText(call.callee), only);

		const types = typeProvider(context, carriesSignal);

		// what the rule says about one step: null when it is fine
		const verdictOf = (step, names) => {
			if (!isChecked(step) || isExempt(step, names, ignore)) {
				return null;
			}
			const carries = carriesSignal(step, names);
			if (step.type !== "CallExpression" || !types) {
				return carries ? null : step.type === "NewExpression" ? "lostWait" : "lostSignal";
			}
			if (!carries) {
				// a function that takes no signal cannot be cancelled: the types say so
				return types.accepts(step) === "no" ? null : "lostSignal";
			}

			return types.usage(step, names) === "ignores" ? "ignoredSignal" : null;
		};

		// checks the steps of one function, and of the callbacks that its steps run
		const check = (fn, names) => {
			if (wiresByHand(fn, names)) {
				return;
			}
			for (const step of stepsOf(fn)) {
				if (step.type === "CallExpression" && (isEffectCall(step, names) || isCombinator(step))) {
					for (const callback of callbacksOf(step)) {
						check(callback, namesOf(callback, names, 0));
					}
					if (isCombinator(step)) {
						checkCombinator(step, names);
					}
				} else {
					const verdict = verdictOf(step, names);
					if (verdict) {
						context.report({ node: step, messageId: verdict });
					}
				}
			}
		};

		// Promise.all([a(), b()]) and Promise.all(items.map((item) => load(item))): each call is a step
		const checkCombinator = (call, names) => {
			const argument = unwrap(call.arguments[0]);
			const elements =
				argument?.type === "ArrayExpression"
					? argument.elements
					: argument?.type === "CallExpression" && argument.callee.property?.name === "map"
						? [argument]
						: [];
			for (const element of elements) {
				const item = unwrap(element);
				if (item?.type === "CallExpression" && item.callee.property?.name === "map" && isFunction(item.arguments[0])) {
					check(item.arguments[0], namesOf(item.arguments[0], names, item.arguments[0].params.length));
				} else if (item?.type === "CallExpression") {
					const verdict = verdictOf(item, names);
					if (verdict) {
						context.report({ node: item, messageId: verdict });
					}
				}
			}
		};

		// `bus.emit(...)` and `store.emit(...)` in a handler: only ctx.emit is dropped after an abort
		const checkEmits = (handler, names) => {
			walkAll(handler.body, (node) => {
				const callee = node.type === "CallExpression" ? node.callee : null;
				const isEmit =
					callee?.type === "MemberExpression" &&
					!callee.computed &&
					callee.property.name === "emit" &&
					callee.object.type === "Identifier" &&
					!names.contexts.has(callee.object.name);
				if (isEmit) {
					context.report({ node, messageId: "staleEmit" });
				}
			});
		};

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

					return;
				}
				const base = { signals: new Set(["signal"]), contexts: new Set() };
				const names = namesOf(handler, base, 1);
				check(handler, names);
				checkEmits(handler, names);
			},
		};
	},
};

export default {
	meta: { name: "nanoeffects" },
	rules: { "policy-handler-uses-signal": rule },
};
