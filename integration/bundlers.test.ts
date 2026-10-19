// The package as a user gets it: packed, installed and bundled by Vite and webpack,
// with and without the `notrace` condition, and the bundles run.
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build as viteBuild } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import webpack from "webpack";

const root = process.cwd();
let app = "";

// what the bundle does: every entry of the package is used, and it reports what it saw
const entry = `
import { createBus } from "nanoeffects";
import { debounce, latest, queue, throttle } from "nanoeffects/policies";
import { all, retry, timeout } from "nanoeffects/effects";
import { createAction, createModule, registerModules } from "nanoeffects/actions";
import { nanoeffectsMiddleware } from "nanoeffects/redux";
import { createObserve } from "nanoeffects/observable";

export const run = async () => {
	const seen = [];
	const bus = createBus({ onUnhandled: ({ type }) => seen.push("unheard " + type) });
	const added = createAction("counter/added");

	bus.on("search", latest(async (query) => { seen.push("search " + query); }));
	bus.on(added, (value) => { seen.push("added " + value); });
	bus.emit("search", "nano");
	bus.emit(added(2));
	bus.emit("nobody", 1);

	const retried = await retry({}, async (attempt) => {
		if (attempt < 2) throw new Error("again");
		return "ok after " + attempt;
	}, { times: 3 });
	const both = await all({}, { one: async () => 1, two: async () => 2 });
	const timed = await timeout({}, 1000, async () => "in time");

	const app = registerModules(bus, [createModule("m", (m) => { m.on("hello", () => seen.push("hello")); })]);
	bus.emit("hello");
	app.dispose();
	bus.emit("hello");

	const middleware = nanoeffectsMiddleware(bus)()((action) => action);
	middleware({ type: "counter/added", payload: 5 });

	const observed = [];
	createObserve(bus)("search").subscribe((query) => observed.push(query));
	bus.emit("search", "again");

	return { seen, retried, both, timed, observed, kinds: [typeof debounce, typeof queue, typeof throttle] };
};
`;

const expected = {
	seen: [
		"search nano",
		"added 2",
		"unheard nobody",
		"hello",
		"unheard hello",
		"added 5",
		"search again",
	],
	retried: "ok after 2",
	both: { one: 1, two: 2 },
	timed: "in time",
	observed: ["again"],
	kinds: ["function", "function", "function"],
};

const importBundle = async (file: string) =>
	(await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as {
		run: () => Promise<unknown>;
	};

beforeAll(() => {
	if (!existsSync(join(root, "dist/index.js"))) {
		execFileSync("pnpm", ["build"], { cwd: root, stdio: "ignore" });
	}
	app = mkdtempSync(join(tmpdir(), "nanoeffects-app-"));
	// pack the package as npm would, and install the tarball by hand: no network, no registry
	const packed = execFileSync(
		"npm",
		["pack", "--ignore-scripts", "--silent", "--pack-destination", app],
		{ cwd: root },
	)
		.toString()
		.trim();
	const target = join(app, "node_modules", "nanoeffects");
	mkdirSync(target, { recursive: true });
	execFileSync("tar", [
		"-xzf",
		join(app, packed),
		"-C",
		target,
		"--strip-components=1",
	]);
	writeFileSync(
		join(app, "package.json"),
		JSON.stringify({ name: "app", type: "module" }),
	);
	writeFileSync(join(app, "main.js"), entry);
	// the same without the entries that have no notrace build: for the size comparison
	writeFileSync(
		join(app, "core.js"),
		`import { createBus } from "nanoeffects";
		import { latest } from "nanoeffects/policies";
		import { retry } from "nanoeffects/effects";
		export const run = async () => {
			const bus = createBus();
			const seen = [];
			bus.on("x", latest(async (value, ctx) => { seen.push(await retry(ctx, async () => value)); }));
			bus.emit("x", 1);
			await new Promise((resolve) => setTimeout(resolve, 5));
			return seen;
		};`,
	);
});

afterAll(() => {
	// the temporary directory is left to the system
});

const viteBundle = async (
	input: string,
	name: string,
	conditions: string[] = [],
) => {
	const outDir = join(app, `out-vite-${name}`);
	await viteBuild({
		root: app,
		configFile: false,
		logLevel: "silent",
		resolve: { conditions },
		build: {
			outDir,
			emptyOutDir: true,
			minify: false,
			lib: { entry: join(app, input), formats: ["es"], fileName: "bundle" },
			target: "es2022",
		},
	});

	return join(outDir, "bundle.js");
};

const webpackBundle = async (
	input: string,
	name: string,
	conditionNames?: string[],
) => {
	const outDir = join(app, `out-webpack-${name}`);
	const stats = await new Promise<webpack.Stats>((resolve, reject) => {
		webpack(
			{
				context: app,
				mode: "production",
				entry: join(app, input),
				target: "node",
				optimization: { minimize: false },
				output: {
					path: outDir,
					filename: "bundle.cjs",
					library: { type: "commonjs2" },
				},
				resolve: conditionNames ? { conditionNames } : {},
			},
			(error, result) => (error || !result ? reject(error) : resolve(result)),
		);
	});
	if (stats.hasErrors()) {
		throw new Error(stats.toString({ errors: true, all: false }));
	}

	return join(outDir, "bundle.cjs");
};

const runCommonJs = async (file: string) =>
	(
		createRequire(import.meta.url)(file) as { run: () => Promise<unknown> }
	).run();

describe("Vite", () => {
	it("bundles every entry of the package, and the bundle runs", async () => {
		const file = await viteBundle("main.js", "full");

		expect(await (await importBundle(file)).run()).toEqual(expected);
	});

	it("the notrace condition removes the tracing code, and the bundle still runs", async () => {
		const normal = readFileSync(await viteBundle("core.js", "core"), "utf8");
		const file = await viteBundle("core.js", "core-notrace", ["notrace"]);
		const lean = readFileSync(file, "utf8");

		expect(normal).toContain("settler");
		expect(lean).not.toContain("settler");
		expect(lean.length).toBeLessThan(normal.length);
		expect(await (await importBundle(file)).run()).toEqual([1]);
	});

	it("the notrace condition keeps every entry working", async () => {
		const file = await viteBundle("main.js", "full-notrace", ["notrace"]);

		expect(await (await importBundle(file)).run()).toEqual(expected);
	});

	it("unused entries are not in the bundle (tree shaking)", async () => {
		const core = readFileSync(await viteBundle("core.js", "shake"), "utf8");

		expect(core).not.toContain("Timed out after");
		expect(core).not.toContain("@@observable");
		expect(core).not.toContain("queue");
	});
});

describe("webpack", () => {
	it("bundles every entry of the package, and the bundle runs", async () => {
		const file = await webpackBundle("main.js", "full");

		expect(await runCommonJs(file)).toEqual(expected);
	});

	it("the notrace condition removes the tracing code, and the bundle still runs", async () => {
		const normal = readFileSync(await webpackBundle("core.js", "core"), "utf8");
		const file = await webpackBundle("core.js", "core-notrace", [
			"notrace",
			"import",
			"module",
			"default",
		]);
		const lean = readFileSync(file, "utf8");

		expect(normal).toContain("settler");
		expect(lean).not.toContain("settler");
		expect(lean.length).toBeLessThan(normal.length);
		expect(await runCommonJs(file)).toEqual([1]);
	});

	it("the notrace condition keeps every entry working", async () => {
		const file = await webpackBundle("main.js", "full-notrace", [
			"notrace",
			"import",
			"module",
			"default",
		]);

		expect(await runCommonJs(file)).toEqual(expected);
	});
});
