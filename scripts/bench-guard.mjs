// Cost of loopGuardPlugin: node --expose-gc scripts/bench-guard.mjs [dist] [--rounds=N]
// Every case runs once per round and the rounds go round-robin, so a drift of the machine falls on all cases alike.
// Each case is a bus without the plugin and the same bus with it; the table has the mean of the rounds and the
// ratio. The chains are of distinct events, so no limit is reached and every emit goes through.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const options = process.argv.slice(2);
const rounds = Number(
	options.find((option) => option.startsWith("--rounds="))?.slice(9) ?? 15,
);
const [dist = "dist"] = options.filter((option) => !option.startsWith("--"));
const load = async (file) => import(pathToFileURL(resolve(dist, file)).href);
const { createBus } = await load("index.js");
const { loopGuardPlugin } = await load("guard.js");

// a chain of `length` events: start emits e0, the handler of e0 emits e1, and so on
const chainBus = (length, guarded, guardOptions = {}) => {
	const bus = createBus();
	if (guarded) {
		bus.use(loopGuardPlugin({ report: () => {}, ...guardOptions }));
	}
	for (let step = 0; step < length; step++) {
		const next = `e${step + 1}`;
		bus.on(
			`e${step}`,
			step + 1 < length ? (_value, ctx) => ctx.emit(next, 1) : () => {},
		);
	}

	return bus;
};

const cases = [];
const add = (name, length, roots, guardOptions) => {
	const plain = chainBus(length, false);
	const guarded = chainBus(length, true, guardOptions);
	cases.push({
		name,
		roots,
		plain: { bus: plain, times: [] },
		guarded: { bus: guarded, times: [] },
	});
};

add("one handler, no chain", 1, 100_000);
add("a chain of 5", 5, 20_000);
add("a chain of 40 (under maxRepeats: no walk)", 40, 5_000);
add("a chain of 200 (walks the chain from 50 on)", 200, 1_000);
add("a chain of 200, maxRepeats 500 (no walk)", 200, 1_000, {
	maxRepeats: 500,
});

const run = (entry, side) => {
	const bus = entry[side].bus;
	const start = performance.now();
	for (let i = 0; i < entry.roots; i++) {
		bus.emit("e0", i);
	}
	entry[side].times.push(performance.now() - start);
};

for (const entry of cases) {
	run(entry, "plain");
	run(entry, "guarded");
	entry.plain.times.length = 0;
	entry.guarded.times.length = 0;
}
for (let round = 0; round < rounds; round++) {
	for (const entry of cases) {
		run(entry, "plain");
		run(entry, "guarded");
	}
}

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
console.log(`${rounds} rounds, times in ms for the whole case`);
console.table(
	cases.map((entry) => {
		const plain = mean(entry.plain.times);
		const guarded = mean(entry.guarded.times);
		const _emits = entry.roots * Number(entry.name.match(/\d+/)?.[0] ?? 1);

		return {
			case: entry.name,
			roots: entry.roots,
			"without the plugin": plain.toFixed(1),
			"with the plugin": guarded.toFixed(1),
			ratio: `${(guarded / plain).toFixed(2)}x`,
			"extra per emit, ns": entry.name.startsWith("one handler")
				? (((guarded - plain) / entry.roots) * 1e6).toFixed(0)
				: "",
		};
	}),
);
