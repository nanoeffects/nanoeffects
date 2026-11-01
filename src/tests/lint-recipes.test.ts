import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "acorn";
import { describe, expect, it } from "vitest";

// The lint recipes of examples/lint flag a handler of a policy that has no ctx parameter, or that takes ctx and
// loses the signal in a step, and nothing else. Biome runs its GritQL rules on the fixture; the ESLint/oxlint
// rule, one plain function over the syntax tree, runs on the same fixture parsed by acorn.

const folder = join(process.cwd(), "examples/lint");
const biome = join(process.cwd(), "node_modules/.bin/biome");

// fixture.js: lines 4 to 7 have no ctx, then the steps that lose the signal (13, 18, 20, 22, 26), then the hard cases
const noContext = [4, 5, 6, 7];
const directSteps = [13, 18, 20, 22, 26];
// the syntax rule also reads inside for await, new Promise, Promise.all, effect callbacks and the key of an options object
const deeperSteps = [32, 37, 41, 45, 48, 51, 54, 57, 61];
// the text rules of Biome do not see these (45 and 54 are caught: a returned Promise.all(items.map(...)) and .then)
const biomeMisses = [32, 37, 41, 48, 51, 57, 61];
// bus.emit in a handler: both the Biome rule and the plugin catch it
const staleEmit = [67];

const biomeLines = () => {
	// Biome writes its diagnostics to stderr or stdout depending on the version; read both
	const run = spawnSync(biome, ["lint", "--max-diagnostics=50", "fixture.js"], {
		cwd: folder,
		encoding: "utf8",
	});
	const output = `${run.stdout}${run.stderr}`;

	return [...output.matchAll(/fixture\.js:(\d+):\d+/g)].map((match) =>
		Number(match[1]),
	);
};

type Report = { node: { loc: { start: { line: number } } }; messageId: string };
type Plugin = {
	rules: Record<
		string,
		{ create: (context: unknown) => Record<string, (node: unknown) => void> }
	>;
};

const loadRule = async () => {
	const { default: plugin } = (await import(
		join(folder, "nanoeffects-lint.mjs")
	)) as {
		default: Plugin;
	};

	return plugin.rules["policy-handler-uses-signal"];
};

// the lines the rule reports for a piece of code
const lintLines = async (
	source: string,
	options: {
		ignore?: string[];
		only?: string[];
		requireContext?: boolean;
	} = {},
) => {
	const rule = await loadRule();
	const program = parse(source, {
		ecmaVersion: "latest",
		sourceType: "module",
		locations: true,
	});
	const reports: Report[] = [];
	const visitor =
		rule?.create({
			report: (report: Report) => reports.push(report),
			options: [options],
		}) ?? {};

	const walk = (node: unknown) => {
		if (!node || typeof node !== "object") {
			return;
		}
		if ((node as { type?: string }).type === "CallExpression") {
			visitor.CallExpression?.(node);
		}
		for (const child of Object.values(node)) {
			if (Array.isArray(child)) {
				child.forEach(walk);
			} else {
				walk(child);
			}
		}
	};
	walk(program);

	return reports.map((report) => report.node.loc.start.line);
};

describe("examples/lint: the fixture", () => {
	it("the Biome rules flag the handlers with no ctx and the direct steps that lose the signal", () => {
		const expected = [...noContext, ...directSteps, 45, 54, ...staleEmit].sort(
			(a, b) => a - b,
		);

		expect(biomeLines()).toEqual(expected);
		for (const line of biomeMisses) {
			expect(biomeLines()).not.toContain(line);
		}
	});

	it("the ESLint and oxlint rule flags those and the deeper cases, and nothing in the fine part", async () => {
		const source = readFileSync(join(folder, "fixture.js"), "utf8");

		expect(await lintLines(source)).toEqual(
			[...noContext, ...directSteps, ...deeperSteps, ...staleEmit].sort(
				(a, b) => a - b,
			),
		);
	});
});

describe("examples/lint: the situations where the signal is hard to pass", () => {
	const flagged = async (
		body: string,
		options?: { ignore?: string[]; only?: string[]; requireContext?: boolean },
	) =>
		(await lintLines(`latest(async (query, ctx) => {\n${body}\n});`, options))
			.length;

	it("flags a step that loses the signal when another step passes it", async () => {
		expect(
			await flagged(
				"const news = await api.news(query);\nconst posts = await api.posts(query, { signal: ctx.signal });",
			),
		).toBe(1);
	});

	it("accepts the signal as a direct argument, in a destructured name, in an alias and in an options variable", async () => {
		expect(await flagged("await api.search(query, ctx.signal);")).toBe(0);
		expect(
			await flagged(
				"const { signal } = ctx;\nawait api.search(query, { signal });",
			),
		).toBe(0);
		expect(
			await flagged(
				"const own = ctx.signal;\nawait api.search(query, { signal: own });",
			),
		).toBe(0);
		expect(
			await flagged(
				"const options = { signal: ctx.signal };\nawait api.search(query, options);",
			),
		).toBe(0);
		expect(
			await flagged(
				"const base = { signal: ctx.signal };\nconst options = { ...base, page: 2 };\nawait api.search(query, options);",
			),
		).toBe(0);
	});

	it("does not take another signal for the handler's: a controller of its own, or a timeout", async () => {
		expect(
			await flagged(
				"const own = new AbortController();\nawait fetch(url, { signal: own.signal });",
			),
		).toBe(1);
		expect(
			await flagged("await fetch(url, { signal: AbortSignal.timeout(5000) });"),
		).toBe(1);
	});

	it("accepts a signal joined with another: AbortSignal.any", async () => {
		expect(
			await flagged(
				"await fetch(url, { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)]) });",
			),
		).toBe(0);
	});

	it("flags each call of Promise.all, also in a map, and accepts them when they pass the signal", async () => {
		expect(
			await flagged(
				"await Promise.all([api.a(query, { signal: ctx.signal }), api.b(query), api.c(query)]);",
			),
		).toBe(2);
		expect(
			await flagged("await Promise.all(ids.map((id) => api.user(id)));"),
		).toBe(1);
		expect(
			await flagged(
				"await Promise.allSettled(ids.map((id) => api.user(id, { signal: ctx.signal })));",
			),
		).toBe(0);
		expect(
			await flagged("return Promise.race([api.a(query), api.b(query)]);"),
		).toBe(2);
	});

	it("looks inside the callbacks of effects", async () => {
		expect(await flagged("return retry(ctx, () => api.search(query));")).toBe(
			1,
		);
		expect(
			await flagged(
				"return retry(ctx, () => api.search(query, { signal: ctx.signal }));",
			),
		).toBe(0);
		expect(
			await flagged(
				"return timeout(ctx, 1000, (child) => api.search(query, child));",
			),
		).toBe(0);
		expect(
			await flagged("return timeout(ctx, 1000, (child) => api.search(query));"),
		).toBe(1);
		expect(
			await flagged("return poll(ctx, () => api.search(query), 1000);"),
		).toBe(1);
		expect(
			await flagged(
				"return all(ctx, { news: (child) => api.news(query, child), posts: () => api.posts(query) });",
			),
		).toBe(1);
		expect(await flagged("return ctx.run((child) => api.search(query));")).toBe(
			1,
		);
		expect(
			await flagged("return ctx.run((child) => api.search(query, child));"),
		).toBe(0);
	});

	it("a retry nested in a timeout is checked at its own level", async () => {
		expect(
			await flagged(
				"return timeout(ctx, 1000, (child) => retry(child, () => api.search(query)));",
			),
		).toBe(1);
		expect(
			await flagged(
				"return timeout(ctx, 1000, (child) => retry(child, () => api.search(query, { signal: child.signal })));",
			),
		).toBe(0);
	});

	it("flags a wait that nothing can cancel, and accepts delay(ctx) and a promise that listens to the signal", async () => {
		expect(
			await flagged(
				"await new Promise((resolve) => setTimeout(resolve, 100));",
			),
		).toBe(1);
		expect(await flagged("await delay(ctx, 100);")).toBe(0);
		expect(
			await flagged(
				"await new Promise((resolve) => {\nconst id = setTimeout(resolve, 100);\nctx.signal.addEventListener('abort', () => clearTimeout(id));\n});",
			),
		).toBe(0);
	});

	it("flags for await over a stream that gets no signal", async () => {
		expect(
			await flagged(
				"for await (const chunk of api.stream(query)) {\nctx.emit('chunk', chunk);\n}",
			),
		).toBe(1);
		expect(
			await flagged(
				"for await (const chunk of api.stream(query, { signal: ctx.signal })) {\nctx.emit('chunk', chunk);\n}",
			),
		).toBe(0);
	});

	it("flags a call chained after a request, such as then, when the request has no signal", async () => {
		expect(
			await flagged(
				"return api.news(query).then((response) => response.json());",
			),
		).toBe(1);
		expect(
			await flagged(
				"return api.news(query, { signal: ctx.signal }).then((response) => response.json());",
			),
		).toBe(0);
	});

	it("flags a call in a loop, a branch and a try block", async () => {
		expect(
			await flagged("for (const id of ids) {\nawait api.user(id);\n}"),
		).toBe(1);
		expect(await flagged("if (query) {\nawait api.user(query);\n}")).toBe(1);
		expect(
			await flagged(
				"try {\nawait api.user(query);\n} catch (error) {\nctx.emit('failed', error);\n}",
			),
		).toBe(1);
		expect(
			await flagged(
				"try {\nawait api.user(query, { signal: ctx.signal });\n} catch (error) {\nctx.emit('failed', error);\n}",
			),
		).toBe(0);
	});

	it("flags an optional call and an await of a call inside a template", async () => {
		expect(await flagged("await api?.search(query);")).toBe(1);
		expect(
			await flagged("await api?.search(query, { signal: ctx.signal });"),
		).toBe(0);
	});

	it("does not flag a call on ctx, a read of a response body, or a call that is awaited without being a call", async () => {
		expect(await flagged("await ctx.emit('a', 1);")).toBe(0);
		expect(
			await flagged(
				"const response = await fetch(url, { signal: ctx.signal });\nreturn response.json();",
			),
		).toBe(0);
		expect(await flagged("await somePromise;")).toBe(0);
	});

	it("leaves a handler that wires the signal by hand", async () => {
		expect(
			await flagged(
				"const request = legacy.start(query);\nctx.signal.addEventListener('abort', () => request.cancel());\nreturn request.done;",
			),
		).toBe(0);
		expect(
			await flagged("onAbort(ctx, () => stop());\nreturn legacy.start(query);"),
		).toBe(0);
	});

	it("takes ignore: callee names that cannot be cancelled", async () => {
		const body =
			"await cache.get(query);\nawait db.users.find(query);\nawait api.search(query);";

		expect(await flagged(body)).toBe(3);
		expect(await flagged(body, { ignore: ["cache.get"] })).toBe(2);
		expect(await flagged(body, { ignore: ["cache.*", "db.*"] })).toBe(1);
	});

	it("takes only: the calls that take a signal are checked, and nothing else is", async () => {
		const body =
			"await cache.get(query);\nawait db.users.find(query);\nawait api.search(query);\nawait fetch(url);";

		expect(await flagged(body, { only: ["api.*", "fetch"] })).toBe(2);
		expect(await flagged(body, { only: ["api.search"] })).toBe(1);
		expect(await flagged(body, { only: ["nothing.*"] })).toBe(0);
	});

	it("only does not hide a wait that nothing can cancel, and ignore wins over only", async () => {
		expect(
			await flagged(
				"await new Promise((resolve) => setTimeout(resolve, 100));",
				{ only: ["api.*"] },
			),
		).toBe(1);
		expect(
			await flagged("await api.search(query);", {
				only: ["api.*"],
				ignore: ["api.search"],
			}),
		).toBe(0);
	});

	it("checks the calls of Promise.all and the callbacks of effects against only too", async () => {
		expect(
			await flagged("await Promise.all([api.a(query), cache.get(query)]);", {
				only: ["api.*"],
			}),
		).toBe(1);
		expect(
			await flagged("return retry(ctx, () => cache.get(query));", {
				only: ["api.*"],
			}),
		).toBe(0);
		expect(
			await flagged("return retry(ctx, () => api.search(query));", {
				only: ["api.*"],
			}),
		).toBe(1);
	});

	it("requireContext: a call must go through ctx or be given ctx, also when the signal is passed by hand", async () => {
		const strict = { requireContext: true };

		expect(
			await flagged("await fetch(url, { signal: ctx.signal });", strict),
		).toBe(1);
		expect(
			await flagged("await api.search(query, { signal: ctx.signal });", strict),
		).toBe(1);
		expect(await flagged("await ctx.fetch(url);", strict)).toBe(0);
		expect(await flagged("await ctx.http.get(url);", strict)).toBe(0);
		expect(await flagged("await loadFeed(ctx, query);", strict)).toBe(0);
		expect(await flagged("await loadFeed(...[ctx, query]);", strict)).toBe(1);
		expect(
			await flagged("return retry(ctx, () => ctx.fetch(url));", strict),
		).toBe(0);
		expect(
			await flagged(
				"return retry(ctx, () => fetch(url, { signal: ctx.signal }));",
				strict,
			),
		).toBe(1);
		expect(
			await flagged(
				"return timeout(ctx, 1000, (child) => child.fetch(url));",
				strict,
			),
		).toBe(0);
	});

	it("requireContext: each call of Promise.all, a response body and the ignore list", async () => {
		const strict = { requireContext: true };

		expect(
			await flagged("await Promise.all([ctx.fetch(a), ctx.fetch(b)]);", strict),
		).toBe(0);
		expect(
			await flagged("await Promise.all([ctx.fetch(a), fetch(b)]);", strict),
		).toBe(1);
		expect(
			await flagged(
				"const response = await ctx.fetch(url);\nreturn response.json();",
				strict,
			),
		).toBe(0);
		expect(
			await flagged("await cache.get(query);", {
				...strict,
				ignore: ["cache.get"],
			}),
		).toBe(0);
		expect(await flagged("await cache.get(query);", strict)).toBe(1);
	});

	it("requireContext is off by default: passing the signal by hand is fine", async () => {
		expect(await flagged("await fetch(url, { signal: ctx.signal });")).toBe(0);
	});

	it("does not look into a function that is only declared in the handler", async () => {
		expect(
			await flagged(
				"const later = async () => api.search(query);\nreturn later;",
			),
		).toBe(0);
	});

	it("checks a debounce around a latest: each handler on its own", async () => {
		const lines = await lintLines(
			"debounce(300, latest(async (query, ctx) => {\n  return api.search(query);\n}));",
		);

		expect(lines).toEqual([2]);
	});

	it("reads a handler that is a function expression, with a destructured ctx", async () => {
		expect(
			await lintLines(
				"queue(async function (draft, { emit }) {\n  await api.save(draft);\n});",
			),
		).toEqual([2]);
		expect(
			await lintLines(
				"queue(async function (draft, { signal }) {\n  await api.save(draft, { signal });\n});",
			),
		).toEqual([]);
	});

	it("flags bus.emit in a handler, which a stale call still delivers, and accepts ctx.emit and a destructured emit", async () => {
		expect(
			await flagged(
				"const items = await api.search(query, { signal: ctx.signal });\nbus.emit('results', items);",
			),
		).toBe(1);
		expect(
			await flagged(
				"const items = await api.search(query, { signal: ctx.signal });\nctx.emit('results', items);",
			),
		).toBe(0);
		expect(
			await lintLines(
				"queue(async (draft, { emit, signal }) => {\n  const saved = await api.save(draft, { signal });\n  emit('saved', saved);\n});",
			),
		).toEqual([]);
	});

	it("ignores a call that is not a policy, or a policy whose handler is not in place", async () => {
		expect(
			await lintLines("other(async (query, ctx) => api.search(query));"),
		).toEqual([]);
		expect(await lintLines("latest(handler);")).toEqual([]);
		expect(
			await lintLines(
				"latest(withLogging(async (query, ctx) => api.search(query)));",
			),
		).toEqual([]);
	});
});

// With type information the rule reads the function it calls. The test builds a TypeScript 5 program for the typed
// fixture (JSDoc types in a .js file) and maps each node of acorn to the node of TypeScript with the same place,
// which is what typescript-eslint does with its own parser.
describe("examples/lint: with type information", () => {
	const typedLines = async () => {
		const ts = (await import("typescript-5")).default;
		const file = join(folder, "typed-fixture.js");
		const source = readFileSync(file, "utf8");
		const program = ts.createProgram([file], {
			allowJs: true,
			checkJs: true,
			noEmit: true,
			strict: true,
			target: ts.ScriptTarget.ES2022,
			lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
		});
		const sourceFile = program.getSourceFile(file);
		const tsNodeAt = (start: number, end: number) => {
			let found: unknown;
			const visit = (node: import("typescript-5").Node) => {
				if (
					node.getStart() === start &&
					node.end === end &&
					ts.isCallExpression(node)
				) {
					found = node;
				}
				ts.forEachChild(node, visit);
			};
			if (sourceFile) {
				visit(sourceFile);
			}

			return found;
		};
		const esTreeNodeToTSNodeMap = {
			get: (node: { start: number; end: number }) =>
				tsNodeAt(node.start, node.end),
		};

		const rule = await loadRule();
		const reports: Report[] = [];
		const visitor =
			rule?.create({
				report: (report: Report) => reports.push(report),
				options: [{}],
				settings: { nanoeffects: { typescript: ts } },
				sourceCode: { parserServices: { program, esTreeNodeToTSNodeMap } },
			}) ?? {};
		const tree = parse(source, {
			ecmaVersion: "latest",
			sourceType: "module",
			locations: true,
		});
		const walk = (node: unknown) => {
			if (!node || typeof node !== "object") {
				return;
			}
			if ((node as { type?: string }).type === "CallExpression") {
				visitor.CallExpression?.(node);
			}
			for (const child of Object.values(node)) {
				if (Array.isArray(child)) {
					child.forEach(walk);
				} else {
					walk(child);
				}
			}
		};
		walk(tree);

		return reports.map(
			(report) => [report.node.loc.start.line, report.messageId] as const,
		);
	};

	it("reports a call without the signal only when the function takes one, and a function that ignores the signal", async () => {
		const reports = await typedLines();
		const lines = readFileSync(join(folder, "typed-fixture.js"), "utf8").split(
			"\n",
		);
		const named = reports.map(
			([line, id]) => `${id}: ${lines[line - 1]?.trim()}`,
		);

		expect(named).toEqual([
			"lostSignal: const first = await searchGood(query);",
			"lostSignal: latest(async (id, ctx) => loadGood(id));",
			"ignoredSignal: latest(async (query, ctx) => searchIgnores(query, { signal: ctx.signal }));",
			"ignoredSignal: latest(async (query, ctx) => streamIgnores(query, ctx.signal));",
			"ignoredSignal: latest(async (id, ctx) => loadIgnores(id, { signal: ctx.signal }));",
			"ignoredSignal: latest(async (query, ctx) => viaHelperIgnores(query, { signal: ctx.signal }));",
			"ignoredSignal: latest(async (query, ctx) => onlyOtherOptions(query, { signal: ctx.signal }));",
			"lostSignal: latest(async (query, ctx) => anyApi.search(query));",
		]);
	});

	it("without type information the same fixture reports the cache call too, which has no signal to pass", async () => {
		const source = readFileSync(join(folder, "typed-fixture.js"), "utf8");
		const lines = await lintLines(source);
		const text = source.split("\n");

		expect(lines.map((line) => text[line - 1]?.trim())).toContain(
			"const cached = await cacheGet(query);",
		);
	});
});
