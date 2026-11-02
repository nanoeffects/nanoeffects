// Two sessions that each reach part of the app: the listeners that look dead in one session are found by the other.
import { describeBus, findOrphans, mergeGraphs } from "nanoeffects/trace";
import {
	createDebugBus,
	type Options,
	type Result,
	runIfMain,
} from "./harness";

type DebugBus = ReturnType<typeof createDebugBus>["bus"];

// the listeners of the app; a function name is what the graph and findOrphans match
const wire = (bus: DebugBus) => {
	bus.on("cart/added", function recalcTotal() {});
	bus.on("cart/added", function writeAudit() {});
	bus.on("cart/cleared", function resetTotal() {});
	bus.on("order/paid", function sendReceipt() {});
};

const names = (orphans: ReturnType<typeof findOrphans>) =>
	orphans.map((orphan) => `${orphan.listener} (${orphan.kind})`).join(", ");

export const run = (options: Options = {}): Result => {
	// session one adds to the cart
	const cartSession = createDebugBus(options);
	wire(cartSession.bus);
	cartSession.bus.emit("cart/added", 1);

	// session two clears it
	const clearSession = createDebugBus(options);
	wire(clearSession.bus);
	clearSession.bus.emit("cart/cleared", 1);

	// describeBus — the listeners the bus holds, by event
	const described = describeBus(cartSession.bus);
	const cartGraph = cartSession.graph.toJSON();

	// findOrphans — the listeners that this one session never saw run
	const alone = findOrphans(described, cartGraph);

	// mergeGraphs — joins the graphs of both sessions
	const merged = mergeGraphs(cartGraph, clearSession.graph.toJSON());
	const together = findOrphans(described, merged);

	return {
		findings: merged.cycles,
		// mergeGraphs gives data, not a logger: draw it from a logger if you need a diagram
		mermaid: "",
		notes: [
			`one session: ${names(alone)}`,
			`both sessions: ${names(together)}`,
			"look for: resetTotal is a false orphan of one session and gone after the merge; sendReceipt is never reached",
		],
	};
};

runIfMain(import.meta, "listeners that no session reached", run);
