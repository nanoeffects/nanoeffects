// Cost of fields made with fromSignal: node --expose-gc scripts/bench-from-signal.mjs [dist] [--rounds=N]
// Every case runs once per round and the rounds go round-robin, so a drift of the machine falls on
// all cases alike. Each case emits 100 000 events to a handler; the table has the mean and the minimum
// of the rounds in ms, and the mean against the plain field.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const options = process.argv.slice(2);
const rounds = Number(
	options.find((option) => option.startsWith("--rounds="))?.slice(9) ?? 15,
);
const [dist = "dist"] = options.filter((option) => !option.startsWith("--"));
const load = (file) => import(pathToFileURL(resolve(dist, file)).href);
const { createBus } = await load("index.js");
const { contextPlugin } = await load("context.js");
const { fromSignal } = await load("signal.js");
const TASKS = 100_000;

const client = (signal) => ({ signal });
const cases = [];
const add = (name, fields, read) => {
	const bus = createBus().use(contextPlugin(fields));
	let sink = 0;
	bus.on("x", (_, ctx) => {
		if (read) {
			sink += ctx.http ? 1 : 0;
		}
	});
	cases.push({
		name,
		times: [],
		run: () => {
			for (let i = 0; i < TASKS; i++) {
				bus.emit("x", i);
			}
			return sink;
		},
	});
};

add("plain field, not read", { http: { id: 1 } }, false);
add("plain field, read", { http: { id: 1 } }, true);
add("fromSignal, not read", { http: fromSignal(client) }, false);
add("fromSignal, read", { http: fromSignal(client) }, true);

for (let round = 0; round < rounds; round++) {
	for (const item of cases) {
		globalThis.gc?.();
		const start = performance.now();
		item.run();
		item.times.push(performance.now() - start);
	}
}

const mean = (list) =>
	list.reduce((sum, value) => sum + value, 0) / list.length;
const reference = mean(cases[1].times);
console.log(
	"case".padEnd(26),
	"mean ms".padStart(9),
	"min ms".padStart(9),
	"vs plain read",
);
for (const item of cases) {
	const average = mean(item.times);
	console.log(
		item.name.padEnd(26),
		average.toFixed(2).padStart(9),
		Math.min(...item.times)
			.toFixed(2)
			.padStart(9),
		`${(average / reference).toFixed(2)}x`.padStart(13),
	);
}
