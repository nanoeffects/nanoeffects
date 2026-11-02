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
	guard: "src/guard/index.ts",
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
		"Handled",
		"HandledCall",
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
	signal: ["FromSignal", "SignalBus", "SignalEmit", "SignalOption"],
	context: ["ContextTask", "NoClash"],
	oop: ["BusMethods", "Extended", "MethodDecorator"],
	trace: [
		"ConsoleLoggerOptions",
		"DescribeBusOptions",
		"EffectName",
		"ExportOptions",
		"Finding",
		"GraphLogger",
		"GraphLoggerOptions",
		"GraphSnapshot",
		"JsonOptions",
		"JsonValue",
		"PayloadMode",
		"PerformanceLoggerOptions",
		"Phase",
		"PolicyStage",
		"PolicyStages",
		"Recorder",
		"ReduxDevtoolsOptions",
		"ReduxDevtoolsState",
		"ReduxExtension",
		"SerializeOptions",
		"TaskInfo",
		"Trace",
		"TraceEvent",
		"TraceLogger",
		"TracePluginOptions",
		"Tracer",
		"TracerOptions",
	],
	guard: ["LimitFinding", "LoopGuardOptions"],
	redux: ["EffectsMiddlewareOptions", "ReduxStoreApi"],
	observable: [
		"EventSource",
		"EventsOptions",
		"Observable",
		"Observe",
		"Observer",
		"Overflow",
		"Source",
		"Subscribable",
	],
	react: ["ReactApi"],
	svelte: ["SvelteApi"],
	vue: ["VueApi"],
	dev: ["DevOptions", "DevPlugin", "LostSignal", "LostSignalsOptions"],
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

	// the word left with the merge of command into action; a new name that brings it back is a decision
	it("exports no type named after a command", () => {
		const names = Object.values(typeNamesOf()).flat();

		expect(names.filter((name) => /Command/.test(name))).toEqual([]);
	}, 60000);
});
