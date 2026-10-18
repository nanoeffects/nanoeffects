// The `notrace` build has no tracing, so its types accept no `trace` option.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../dist/notrace/", import.meta.url);
// the option of `BusOptions`; the `trace` of `Bus` is read-only and stays
const from = /^(\s+)trace\?: Tracer;$/m;
let changed = 0;

for (const name of readdirSync(dir).filter((file) => file.endsWith(".d.ts"))) {
	const file = new URL(name, dir);
	const text = readFileSync(file, "utf8");
	if (from.test(text)) {
		writeFileSync(file, text.replace(from, "$1trace?: never;"));
		changed++;
	}
}

if (changed === 0) {
	throw new Error(
		"notrace-types: `BusOptions.trace` was not found in dist/notrace",
	);
}
