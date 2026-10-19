// A check "as a user": a clean project, the package installed from npm (or from a tarball), the
// example from the start of README type-checked and run.
// `node scripts/consumer-check.mjs` installs `nanoeffects@latest`; pass another spec as an argument,
// e.g. `nanoeffects@0.1.0` or a path to a `.tgz`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const spec = process.argv[2] ?? "nanoeffects@latest";
const dir = mkdtempSync(join(tmpdir(), "nanoeffects-consumer-"));
const run = (command, args) =>
	execFileSync(command, args, { cwd: dir, stdio: "inherit" });

writeFileSync(
	join(dir, "package.json"),
	JSON.stringify({ name: "consumer", private: true, type: "module" }),
);
run("npm", [
	"install",
	"--no-audit",
	"--no-fund",
	spec,
	"typescript",
	"tsx",
	"@types/node",
]);

writeFileSync(
	join(dir, "tsconfig.json"),
	JSON.stringify({
		compilerOptions: {
			target: "ES2022",
			module: "ESNext",
			moduleResolution: "bundler",
			strict: true,
			noEmit: true,
			skipLibCheck: false,
			lib: ["ES2023", "DOM"],
			types: ["node"],
		},
		include: ["main.ts"],
	}),
);
// the example of README, with a fake api, and the other entries used once
writeFileSync(
	join(dir, "main.ts"),
	`import { createBus } from "nanoeffects";
import { retry } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";
import { createAction, createModule, registerModules } from "nanoeffects/actions";
import { createTracer, consoleLogger } from "nanoeffects/trace";

type Item = { id: number };
type Events = { search: string; results: Item[] };

const api = {
	search: async (query: string, _options: { signal: AbortSignal }): Promise<Item[]> =>
		query.split("").map((_, id) => ({ id })),
};

const bus = createBus<Events>({ trace: createTracer(consoleLogger()) });
const shown: number[] = [];

bus.on(
	"search",
	latest(async (query, ctx) => {
		const items = await retry(ctx, () => api.search(query, { signal: ctx.signal }));
		ctx.emit("results", items);
	}),
);
bus.on("results", (items) => {
	shown.push(items.length);
});
const loaded = createAction("results");
void loaded;
registerModules(bus, [createModule<Events>("m", () => {})]);

bus.emit("search", "nano");
await new Promise((resolve) => setTimeout(resolve, 20));
if (shown.join() !== "4") throw new Error("the example did not work: " + shown.join());
console.log("consumer check passed");
`,
);
run("npx", ["tsc", "-p", "tsconfig.json"]);
run("npx", ["tsx", "main.ts"]);
