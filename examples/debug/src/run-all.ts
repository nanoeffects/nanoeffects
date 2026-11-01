// Runs every scenario one after another and prints each result.

import { run as assertNoCycles } from "./assert-no-cycles";
import { run as chainBroken } from "./chain-broken";
import { run as cleanFlow } from "./clean-flow";
import { run as exportGraph } from "./export-graph";
import { run as failingHandler } from "./failing-handler";
import { printResult } from "./harness";
import { run as hostilePayloads } from "./hostile-payloads";
import { run as ignoreRecursion } from "./ignore-recursion";
import { run as loopAsync } from "./loop-async";
import { run as loopMicrotask } from "./loop-microtask";
import { run as loopModules } from "./loop-modules";
import { run as loopSameEvent } from "./loop-same-event";
import { run as loopTwoHandlers } from "./loop-two-handlers";
import { run as stormComponent } from "./storm-component";

export const scenarios = {
	"loop-two-handlers": loopTwoHandlers,
	"loop-same-event": loopSameEvent,
	"loop-async": loopAsync,
	"loop-modules": loopModules,
	"loop-microtask": loopMicrotask,
	"storm-component": stormComponent,
	"chain-broken": chainBroken,
	"export-graph": exportGraph,
	"hostile-payloads": hostilePayloads,
	"clean-flow": cleanFlow,
	"ignore-recursion": ignoreRecursion,
	"failing-handler": failingHandler,
	"assert-no-cycles": assertNoCycles,
};

if (process.argv[1]?.endsWith("run-all.ts")) {
	for (const [title, run] of Object.entries(scenarios)) {
		printResult(title, await run({ print: false }));
	}
}
