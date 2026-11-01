// A loop that goes through await and a timer, so the call stack never grows.
import { createDebugBus, type Options, resultOf, runIfMain } from "./harness";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const run = async (options: Options = {}) => {
	const { bus, graph } = createDebugBus(options);

	bus.on("poll/start", async (round, ctx) => {
		await pause(1);
		if (round < 20) {
			ctx.emit("poll/done", round + 1);
		}
	});
	bus.on("poll/done", async (round, ctx) => {
		await pause(1);
		ctx.emit("poll/start", round);
	});

	bus.emit("poll/start", 0);
	await pause(200);

	return resultOf(graph, [
		"look for: the loop is found across the gaps, not only in one call",
	]);
};

runIfMain(import.meta, "a loop across await and timers", run);
