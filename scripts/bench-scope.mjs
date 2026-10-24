// Cost of scopes: node --expose-gc scripts/bench-scope.mjs [dist] [baseline-dist]
// `baseline-dist` is a build from before the change, to compare the bus without the plugin.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const load = async (dist, file) =>
	import(pathToFileURL(resolve(dist, file)).href);

const [dist = "dist", baseline] = process.argv.slice(2);
const TASKS = 100_000;
const ROUNDS = 7;

const best = (fn) => {
	fn(); // warm up
	let fastest = Number.POSITIVE_INFINITY;
	for (let round = 0; round < ROUNDS; round++) {
		const start = performance.now();
		fn();
		fastest = Math.min(fastest, performance.now() - start);
	}
	return fastest;
};

const results = [];
const report = (name, ms) => {
	results.push({ case: name, "ms per 100k tasks": ms.toFixed(1) });
};

const plainEmit = async (where, name) => {
	const { createBus } = await load(where, "index.js");
	const bus = createBus();
	bus.on("x", () => {});
	report(
		name,
		best(() => {
			for (let i = 0; i < TASKS; i++) {
				bus.emit("x", i);
			}
		}),
	);
};

if (baseline) {
	await plainEmit(baseline, "HEAD, no plugin");
}
await plainEmit(dist, "this build, no plugin");

const { createBus } = await load(dist, "index.js");
const { createCommand, createAction } = await load(dist, "actions.js");

{
	const bus = createBus();
	const noScope = createCommand("c", () => 1);
	report(
		"this build, no plugin, command",
		best(() => {
			for (let i = 0; i < TASKS; i++) {
				bus.emit(noScope());
			}
		}),
	);
}
const { scopePlugin } = await load(dist, "scope.js");
const { delay } = await load(dist, "effects.js");

{
	const bus = createBus().use(scopePlugin());
	bus.on("x", () => {});
	report(
		"plugin, plain emit",
		best(() => {
			for (let i = 0; i < TASKS; i++) {
				bus.emit("x", i);
			}
		}),
	);
}
{
	const bus = createBus().use(scopePlugin());
	const noScope = createCommand("c", () => 1);
	report(
		"plugin, command with no scope",
		best(() => {
			for (let i = 0; i < TASKS; i++) {
				bus.emit(noScope());
			}
		}),
	);
}
const scope = { context: { a: 1, b: { n: 2 } }, effects: { delay } };
const scoped = () => {
	const bus = createBus().use(scopePlugin());
	const command = createCommand("c", () => 1, scope);
	return { bus, command };
};
{
	const { bus, command } = scoped();
	report(
		"plugin, command with a scope of 3 fields",
		best(() => {
			for (let i = 0; i < TASKS; i++) {
				bus.emit(command());
			}
		}),
	);
}
{
	const { bus, command } = scoped();
	report(
		"plugin, command + scope in emit",
		best(() => {
			for (let i = 0; i < TASKS; i++) {
				bus.emit(command(), { context: { a: i } });
			}
		}),
	);
}
{
	const bus = createBus().use(scopePlugin());
	const action = createAction("x", scope);
	bus.on(action, () => {});
	report(
		"plugin, action with a scope",
		best(() => {
			for (let i = 0; i < TASKS; i++) {
				bus.emit(action(i));
			}
		}),
	);
}

console.table(results);

// does the cost grow with history? batches of 10 000 tasks, time and heap after gc
if (typeof globalThis.gc === "function") {
	const { bus, command } = scoped();
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
