// A loop made of microtasks: it never lets a page draw. The guard cuts it.
import { loopGuardPlugin } from "nanoeffects/guard";
import { createDebugBus, type Options, resultOf, runIfMain } from "./harness";

const turns = async (count: number) => {
	for (let turn = 0; turn < count; turn += 1) {
		await Promise.resolve();
	}
};

const loopOn = (
	bus: ReturnType<typeof createDebugBus>["bus"],
	limit: number,
) => {
	let calls = 0;
	bus.on("spin", async (_round, ctx) => {
		calls += 1;
		await Promise.resolve();
		// without the guard this scenario stops itself at `limit`; a real loop would not
		if (calls < limit) {
			ctx.emit("spin", 0);
		}
	});
	bus.emit("spin", 0);

	return () => calls;
};

export const run = async (options: Options = {}) => {
	const free = createDebugBus(options);
	const freeCalls = loopOn(free.bus, 500);
	await turns(2000);

	const guarded = createDebugBus(options);
	const reports: string[] = [];
	// loopGuardPlugin — refuses the emit that would pass 50 repeats of one event in a chain
	guarded.bus.use(
		loopGuardPlugin({
			maxRepeats: 50,
			report: (finding) => reports.push(finding.path.join(" → ")),
		}),
	);
	const guardedCalls = loopOn(guarded.bus, 500);
	await turns(2000);

	return resultOf(guarded.graph, [
		`without the guard the handler ran ${freeCalls()} times (it stopped only at the test limit of 500)`,
		`with the guard it ran ${guardedCalls()} times; the guard said: ${reports.join(", ")}`,
	]);
};

runIfMain(import.meta, "a loop of microtasks, cut by the guard", run);
