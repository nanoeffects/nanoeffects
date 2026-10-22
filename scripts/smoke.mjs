// Runs the built package on a plain Node, with no dev tools: every entry loads and does its job.
// `node scripts/smoke.mjs` (also with `--notrace`, for the build without tracing).

import { join } from "node:path";
import { pathToFileURL } from "node:url";

const notrace = process.argv.includes("--notrace");
const entry = (dir, name) =>
	import(pathToFileURL(join(process.cwd(), "dist", dir, `${name}.js`)).href);
// `observable` has no build without tracing: it has no tracing in it
const load = (name) =>
	entry(notrace && name !== "observable" ? "notrace" : "", name);

const { createBus } = await load("index");
const { latest, debounce, queue, throttle } = await load("policies");
const { retry, timeout, all, delay } = await load("effects");
const { createAction, createModule, modulePlugin } = await load("actions");
const { createEffectsMiddleware } = await load("redux");
const { createObserve } = await load("observable");

const fail = (message) => {
	console.error(`smoke test failed: ${message}`);
	process.exit(1);
};

const seen = [];
const bus = createBus({
	onUnhandled: ({ type }) => seen.push(`unheard ${type}`),
});
const added = createAction("counter/added");
bus.on(
	"search",
	latest(async (query) => void seen.push(`search ${query}`)),
);
bus.on(added, (value) => void seen.push(`added ${value}`));
bus.emit("search", "nano");
bus.emit(added(2));
bus.emit("nobody", 1);

const retried = await retry(
	{},
	async (attempt) => {
		if (attempt < 2) {
			throw new Error("again");
		}
		return attempt;
	},
	{ times: 3 },
);
const both = await all({}, { one: async () => 1, two: async () => 2 });
const timed = await timeout({}, 1000, async () => "in time");
await delay({}, 5);

const app = bus.use(
	modulePlugin([
		createModule("m", (m) => m.on("hello", () => seen.push("hello"))),
	]),
);
bus.emit("hello");
app.dispose();
bus.emit("hello");
const effectsBus = createBus();
effectsBus.on("counter/added", (value) => seen.push(`added ${value}`));
createEffectsMiddleware(effectsBus)({
	dispatch: (action) => action,
	getState: () => ({}),
})((action) => action)({
	type: "counter/added",
	payload: 5,
});
const observed = [];
createObserve(bus)("search").subscribe((query) => observed.push(query));
bus.emit("search", "again");

const expected = [
	"search nano",
	"added 2",
	"unheard nobody",
	"hello",
	"unheard hello",
	"added 5",
	"search again",
];
if (JSON.stringify(seen) !== JSON.stringify(expected)) {
	fail(`events ${JSON.stringify(seen)}`);
}
if (retried !== 2 || both.one !== 1 || both.two !== 2 || timed !== "in time") {
	fail("effects");
}
if (observed.join() !== "again") {
	fail("observable");
}
if (
	[debounce, queue, throttle].some((policy) => typeof policy !== "function")
) {
	fail("policies");
}

console.log(
	`smoke test passed on Node ${process.versions.node}${notrace ? " (notrace)" : ""}`,
);
