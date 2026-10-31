// Cost of scopes: node --expose-gc scripts/bench-scope.mjs [dist] [baseline-dist] [--rounds=N]
// Every case runs once per round and the rounds go round-robin, so a drift of the machine
// (other work, heat) falls on all cases alike. The table has the mean, the median, the
// standard deviation and the minimum of the rounds, and the mean against the reference case.
// `baseline-dist` is a build from before the change. It is compared with `dist` in separate
// processes, because two copies of `createBus` in one process do not optimise alike: the one
// that runs first looks faster.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const load = async (dist, file) =>
	import(pathToFileURL(resolve(dist, file)).href);

const options = process.argv.slice(2);
const rounds = Number(
	options.find((option) => option.startsWith("--rounds="))?.slice(9) ?? 15,
);
const [dist = "dist", baseline] = options.filter(
	(option) => !option.startsWith("--"),
);
const TASKS = 100_000;

const cases = [];
const add = (name, run) => cases.push({ name, run, times: [] });

const { createBus } = await load(dist, "index.js");
const { createAction } = await load(dist, "actions.js");
const { scopePlugin } = await load(dist, "scope.js");
const { delay } = await load(dist, "effects.js");
const scope = { a: 1, b: { n: 2 }, effects: { delay } };

{
	const bus = createBus();
	bus.on("x", () => {});
	add("this build, no plugin", () => {
		for (let i = 0; i < TASKS; i++) {
			bus.emit("x", i);
		}
	});
}
{
	const bus = createBus();
	const command = createAction("c", () => 1);
	add("this build, no plugin, command", () => {
		for (let i = 0; i < TASKS; i++) {
			bus.emit(command());
		}
	});
}
{
	const bus = createBus().use(scopePlugin());
	bus.on("x", () => {});
	add("plugin, plain emit", () => {
		for (let i = 0; i < TASKS; i++) {
			bus.emit("x", i);
		}
	});
}
{
	const bus = createBus().use(scopePlugin());
	const command = createAction("c", () => 1);
	add("plugin, command with no scope", () => {
		for (let i = 0; i < TASKS; i++) {
			bus.emit(command());
		}
	});
}
{
	const bus = createBus().use(scopePlugin());
	const command = createAction("c", () => 1, scope);
	add("plugin, command with a scope of 3 fields", () => {
		for (let i = 0; i < TASKS; i++) {
			bus.emit(command());
		}
	});
}
{
	const bus = createBus().use(scopePlugin());
	const command = createAction("c", () => 1, scope);
	add("plugin, command + a new scope in each emit", () => {
		for (let i = 0; i < TASKS; i++) {
			bus.emit(command(), { a: i });
		}
	});
}
{
	const bus = createBus().use(scopePlugin());
	const action = createAction("x", scope);
	bus.on(action, () => {});
	add("plugin, action with a scope", () => {
		for (let i = 0; i < TASKS; i++) {
			bus.emit(action(i));
		}
	});
}

for (const { run } of cases) {
	run(); // warm up
}
for (let round = 0; round < rounds; round++) {
	for (const entry of cases) {
		const start = performance.now();
		entry.run();
		entry.times.push(performance.now() - start);
	}
}

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
const median = (values) =>
	[...values].sort((a, b) => a - b)[values.length >> 1];
const deviation = (values) => {
	const centre = mean(values);
	return Math.sqrt(mean(values.map((v) => (v - centre) ** 2)));
};

// the references: a plain emit is compared with no plugin, a command with a command without it
const reference = (name) =>
	cases.find((entry) =>
		name.includes("command") || name.includes("action")
			? entry.name === "this build, no plugin, command"
			: entry.name === "this build, no plugin",
	);

console.log(`${TASKS} tasks per case, ${rounds} rounds, times in ms`);
console.table(
	cases.map((entry) => ({
		case: entry.name,
		mean: mean(entry.times).toFixed(1),
		median: median(entry.times).toFixed(1),
		"std dev": deviation(entry.times).toFixed(1),
		min: Math.min(...entry.times).toFixed(1),
		"mean vs reference": `${(mean(entry.times) / mean(reference(entry.name).times)).toFixed(2)}x`,
	})),
);

// the bus without the plugin against a build from before the change, one process each
if (baseline) {
	const code = `
		import { pathToFileURL } from "node:url";
		import { resolve } from "node:path";
		const { createBus } = await import(pathToFileURL(resolve(process.argv[1], "index.js")).href);
		const bus = createBus();
		bus.on("x", () => {});
		const run = () => {
			const start = performance.now();
			for (let i = 0; i < ${TASKS}; i++) bus.emit("x", i);
			return performance.now() - start;
		};
		for (let i = 0; i < 5; i++) run();
		const times = Array.from({ length: ${rounds} }, run);
		console.log(times.reduce((sum, v) => sum + v, 0) / times.length);
	`;
	const meanIn = (where) =>
		execFileSync(process.execPath, ["--input-type=module", "-e", code, where], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	const rows = [];
	for (let pass = 1; pass <= 3; pass++) {
		const before = Number(meanIn(baseline));
		const after = Number(meanIn(dist));
		rows.push({
			pass,
			"HEAD mean": before.toFixed(2),
			"this build mean": after.toFixed(2),
			ratio: `${(after / before).toFixed(2)}x`,
		});
	}
	console.log("no plugin, plain emit, a process for each build");
	console.table(rows);
}

// does the cost grow with history? batches of 10 000 tasks, time and heap after gc
if (typeof globalThis.gc === "function") {
	const bus = createBus().use(scopePlugin());
	const command = createAction("c", () => 1, scope);
	const batches = [];
	for (let batch = 1; batch <= 10; batch++) {
		const start = performance.now();
		for (let i = 0; i < 10_000; i++) {
			bus.emit(command());
		}
		const ms = performance.now() - start;
		globalThis.gc();
		batches.push({
			batch,
			ms: ms.toFixed(1),
			"heap MB after gc": (process.memoryUsage().heapUsed / 1048576).toFixed(2),
		});
	}
	console.table(batches);
} else {
	console.log("run with --expose-gc for the batch check");
}
