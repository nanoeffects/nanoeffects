import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript-5";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));

// The source file behind each entry of `package.json` `exports` (the same files `tsdown.config.ts` builds).
const entries: Record<string, string> = {
	".": "src/index.ts",
	effects: "src/effects/index.ts",
	policies: "src/policies/index.ts",
	actions: "src/actions/index.ts",
	scope: "src/scope/index.ts",
	match: "src/match/index.ts",
	signal: "src/signal/index.ts",
	context: "src/context/index.ts",
	oop: "src/oop/index.ts",
	trace: "src/trace/index.ts",
	redux: "src/store/redux/index.ts",
	observable: "src/observable.ts",
	react: "src/react/index.ts",
	svelte: "src/svelte/index.ts",
	vue: "src/vue/index.ts",
	dev: "src/dev/index.ts",
};

// The names an entry exports that exist only as types. The runtime names are in exports.test.ts.
const typeExports: Record<string, string[]> = {
	".": [
		"Action",
		"Actions",
		"AnyEvent",
		"Bus",
		"BusOptions",
		"Call",
		"Command",
		"CommandCall",
		"Context",
		"ContextOf",
		"ContextOption",
		"Emit",
		"Emittable",
		"EventKey",
		"EventLike",
		"EventMap",
		"EventPayload",
		"EventsOf",
		"Handler",
		"HandlerRef",
		"Keys",
		"Off",
		"On",
		"PayloadOf",
		"Task",
		"UnsubscribeCallback",
		"WithContext",
		"WithPayload",
		"WithSignal",
		"WithType",
	],
	effects: [
		"BackoffOptions",
		"CancellableExecutor",
		"CancellableHandle",
		"Effect",
		"EffectContext",
		"GroupOptions",
		"PollOptions",
		"RaceStarter",
		"RetryOptions",
		"StarterOf",
		"TakeOptions",
	],
	policies: [
		"DebounceOptions",
		"LatestOptions",
		"LeadingOptions",
		"PolicyFunction",
		"QueueOptions",
		"ThrottleOptions",
	],
	actions: [
		"ActionCreator",
		"Binding",
		"EmitterApi",
		"FreeActionCreator",
		"Job",
		"Module",
		"ModuleApi",
		"ModuleContext",
	],
	scope: ["Effect", "Effects", "EmitScope", "Scope", "Scoped", "Signaled"],
	match: ["MatchApi"],
	signal: ["SignalBus", "SignalEmit", "SignalOption"],
	context: ["ContextTask", "NoClash"],
	oop: ["BusMethods", "Extended", "MethodDecorator"],
	trace: [
		"ConsoleLoggerOptions",
		"EffectName",
		"PayloadMode",
		"PerformanceLoggerOptions",
		"Phase",
		"PolicyStage",
		"PolicyStages",
		"Recorder",
		"ReduxDevtoolsOptions",
		"ReduxDevtoolsState",
		"ReduxExtension",
		"Trace",
		"TraceEvent",
		"TraceLogger",
		"Tracer",
		"TracerOptions",
	],
	redux: ["EffectsMiddlewareOptions", "ReduxStoreApi"],
	observable: ["Observable", "Observe", "Observer", "Source", "Subscribable"],
	react: ["ReactApi"],
	svelte: ["SvelteApi"],
	vue: ["VueApi"],
	dev: ["DevOptions", "DevPlugin"],
};

const typeNamesOf = (): Record<string, string[]> => {
	const config = ts.getParsedCommandLineOfConfigFile(
		`${root}tsconfig.json`,
		{},
		{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
	);
	const program = ts.createProgram(
		Object.values(entries).map((file) => `${root}${file}`),
		config?.options ?? {},
	);
	const checker = program.getTypeChecker();
	const names: Record<string, string[]> = {};

	for (const [entry, file] of Object.entries(entries)) {
		const source = program.getSourceFile(`${root}${file}`);
		const module = source && checker.getSymbolAtLocation(source);
		const symbols = module ? checker.getExportsOfModule(module) : [];
		names[entry] = symbols
			.filter((symbol) => {
				const real =
					symbol.flags & ts.SymbolFlags.Alias
						? checker.getAliasedSymbol(symbol)
						: symbol;

				return !(real.flags & ts.SymbolFlags.Value);
			})
			.map((symbol) => symbol.name)
			.sort();
	}

	return names;
};

describe("the public surface", () => {
	it("lists a source file for every entry of package.json", () => {
		const manifest = JSON.parse(
			readFileSync(`${root}package.json`, "utf8"),
		) as {
			exports: Record<string, unknown>;
		};
		const published = Object.keys(manifest.exports).map((key) =>
			key === "." ? key : key.replace("./", ""),
		);

		expect(Object.keys(entries).sort()).toEqual(published.sort());
	});

	it("exports these types from each entry", () => {
		expect(typeNamesOf()).toEqual(typeExports);
	}, 60000);

	describe("the stability page", () => {
		const page = readFileSync(`${root}docs/stability.md`, "utf8");
		const manifest = JSON.parse(
			readFileSync(`${root}package.json`, "utf8"),
		) as {
			engines: { node: string };
			peerDependencies: Record<string, string>;
		};

		it("has a row for every entry", () => {
			for (const entry of Object.keys(entries)) {
				const name = entry === "." ? "nanoeffects" : `nanoeffects/${entry}`;

				expect(page, name).toContain(`| \`${name}\` |`);
			}
		});

		it("names the Node versions the smoke test runs on", () => {
			const workflow = readFileSync(`${root}.github/workflows/ci.yml`, "utf8");
			const smoke = workflow.slice(workflow.indexOf("smoke:"));
			const versions = /node: \[([\d, ]+)\]/.exec(smoke)?.[1];
			const list = (versions ?? "").split(",").map((version) => version.trim());

			expect(list.length).toBeGreaterThan(0);
			for (const version of list) {
				expect(page, `Node ${version}`).toMatch(new RegExp(`\\b${version}\\b`));
			}
			expect(manifest.engines.node).toBe(`>=${list[0]}`);
		});

		it("names the peer ranges of the frameworks", () => {
			const wanted: Record<string, string> = {
				react: "React | 18 or newer",
				vue: "Vue | 3.3 or newer",
				svelte: "Svelte | 5 or newer",
			};

			for (const [name, text] of Object.entries(wanted)) {
				const range = manifest.peerDependencies[name]?.replace(">=", "");

				expect(text.split("| ")[1]?.startsWith(range ?? "?"), name).toBe(true);
				expect(page, name).toContain(text);
			}
		});
	});
});
