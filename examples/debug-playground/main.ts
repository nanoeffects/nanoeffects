// Starts a loop with a button, shows the report and the graph, and sends the finding to Redux DevTools.
import { createBus } from "nanoeffects";
import { loopGuardPlugin } from "nanoeffects/guard";
import {
	createTracer,
	graphLogger,
	reduxDevtools,
	tracePlugin,
} from "nanoeffects/trace";

type Events = Record<string, number>;

// mermaid is loaded by the page from a CDN; this is the part of it that the page uses
declare const mermaid: {
	render: (id: string, text: string) => Promise<{ svg: string }>;
};

const report = document.querySelector<HTMLElement>("#report");
const picture = document.querySelector<HTMLElement>("#graph");
const guardBox = document.querySelector<HTMLInputElement>("#guard");

const lines: string[] = [];
const say = (text: string) => {
	lines.push(text);
	if (report) {
		report.textContent = lines.join("\n\n");
	}
};

// graphLogger — the map of events, the loop finder; devtools: true also sends each finding to Redux DevTools
const graph = graphLogger({
	name: "debug playground",
	devtools: true,
	// onCycle — shows the finding on the page instead of the console
	onCycle: (finding) => say(`${finding.kind}: ${finding.path.join(" → ")}`),
});

// reduxDevtools — lists the emits; it does nothing when the extension is not installed
const trace = createTracer([
	reduxDevtools({ name: "debug playground" }),
	graph,
]);

const makeBus = (guarded: boolean) => {
	const bus = createBus<Events>({ trace }).use(tracePlugin());
	if (guarded) {
		// loopGuardPlugin — refuses the emit that would pass 20 repeats of one event in a chain
		bus.use(
			loopGuardPlugin({
				maxRepeats: 20,
				report: (finding) => say(`guard stopped: ${finding.path.join(" → ")}`),
			}),
		);
	}

	return bus;
};

// one bus without the guard and one with it; the box picks which one a button uses
const free = makeBus(false);
const guarded = makeBus(true);
const current = () => (guardBox?.checked ? guarded : free);

const wire = (bus: typeof free) => {
	bus.on("cart/changed", (round, ctx) => {
		if (round < 40) {
			ctx.emit("total/changed", round + 1);
		}
	});
	bus.on("total/changed", (round, ctx) => {
		ctx.emit("cart/changed", round);
	});
	bus.on("clear", (round, ctx) => {
		if (round < 40) {
			ctx.emit("clear", round + 1);
		}
	});
	bus.on("tick", async (round, ctx) => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		if (round < 40) {
			ctx.emit("tock", round + 1);
		}
	});
	bus.on("tock", (round, ctx) => {
		ctx.emit("tick", round);
	});
	bus.on("spin", async (round, ctx) => {
		await Promise.resolve();
		// the limit keeps the page alive when the guard is off; a real loop would have none
		if (round < 3000) {
			ctx.emit("spin", round + 1);
		}
	});
	bus.on("filters/changed", () => {});
};
wire(free);
wire(guarded);

const draw = async () => {
	if (!picture) {
		return;
	}
	const { svg } = await mermaid.render("graph-svg", graph.toMermaid());
	picture.innerHTML = svg;
};

const press = (id: string, action: () => void) => {
	document.querySelector(`#${id}`)?.addEventListener("click", () => {
		action();
		setTimeout(draw, 100);
	});
};

press("two", () => current().emit("cart/changed", 0));
press("same", () => current().emit("clear", 0));
press("async", () => current().emit("tick", 0));
press("microtask", () => current().emit("spin", 0));
press("storm", () => {
	// a component that emits on every render: 300 emits from outside any handler
	for (let render = 0; render < 300; render += 1) {
		current().emit("filters/changed", render);
	}
});
press("clear", () => {
	graph.clear();
	lines.length = 0;
	say("The graph is clear.");
});
