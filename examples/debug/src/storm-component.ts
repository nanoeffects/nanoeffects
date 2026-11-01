// A component that emits on every render: no chain, only a storm of one event from outside.
import { loopGuardPlugin } from "nanoeffects/guard";
import {
	createClock,
	createDebugBus,
	type Options,
	resultOf,
	runIfMain,
} from "./harness";

// a stand-in for a component that renders again each time its own event arrives
const renderLoop = (
	bus: ReturnType<typeof createDebugBus>["bus"],
	clock: ReturnType<typeof createClock>,
	times: number,
) => {
	let shown = 0;
	bus.on("filters/changed", () => {
		shown += 1;
	});
	for (let render = 0; render < times; render += 1) {
		clock.advance(2);
		bus.emit("filters/changed", render);
	}

	return () => shown;
};

export const run = (options: Options = {}) => {
	const clock = createClock();
	const open = createDebugBus({ ...options, now: clock.now });
	const openShown = renderLoop(open.bus, clock, 300);

	const limitedClock = createClock();
	const limited = createDebugBus({ ...options, now: limitedClock.now });
	// maxPerSecond — refuses the emits of one event from outside that come faster than 100 a second
	limited.bus.use(loopGuardPlugin({ maxPerSecond: 100, report: () => {} }));
	const limitedShown = renderLoop(limited.bus, limitedClock, 300);

	return resultOf(open.graph, [
		`look for: a storm of filters/changed, with no cycle path`,
		`handled without a limit: ${openShown()}, with maxPerSecond: 100 → ${limitedShown()}`,
	]);
};

runIfMain(import.meta, "a component that emits on every render", run);
