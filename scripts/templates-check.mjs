// Type-checks the TypeScript templates of create-nanoeffects against the sources of nanoeffects.
// `node scripts/templates-check.mjs`: for each `*-ts` template it writes a tsconfig in a temporary
// directory that extends the template's own and maps `nanoeffects/*` to `src`, as the docs do.
import { execFileSync } from "node:child_process";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const templatesDir = join(root, "packages", "create-nanoeffects", "templates");
const rootConfig = JSON.parse(
	readFileSync(join(root, "tsconfig.json"), "utf8"),
);

// the mapping of the root tsconfig, with absolute targets so it works from any directory
const paths = Object.fromEntries(
	Object.entries(rootConfig.compilerOptions.paths).map(([name, targets]) => [
		name,
		targets.map((target) => resolve(root, target)),
	]),
);

const templates = readdirSync(templatesDir).filter((name) =>
	name.endsWith("-ts"),
);
const workdir = mkdtempSync(join(tmpdir(), "nanoeffects-templates-"));
let failed = false;

for (const template of templates) {
	const directory = join(templatesDir, template);
	const config = join(workdir, `${template}.json`);
	const options = {
		extends: join(directory, "tsconfig.json"),
		compilerOptions: {
			paths,
			// the sources use Symbol.dispose
			lib: ["ES2023", "ESNext.Disposable", "DOM", "DOM.Iterable"],
		},
		include: [join(directory, "src")],
	};
	writeFileSync(config, JSON.stringify(options));

	// `tsc` cannot read a .vue file: a template that has one is checked with `vue-tsc`
	const hasVue = readdirSync(join(directory, "src")).some((file) =>
		file.endsWith(".vue"),
	);
	const [command, ...args] = hasVue
		? ["node", join(root, "scripts", "vue-tsc.mjs")]
		: ["pnpm", "exec", "tsc"];

	let output = "";
	try {
		execFileSync(command, [...args, "-p", config, "--noEmit"], {
			cwd: root,
			encoding: "utf8",
			stdio: "pipe",
		});
	} catch (error) {
		output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
	}

	// the sources of nanoeffects are checked by `pnpm tsgo`; only the files of the template count here
	const own = output
		.split("\n")
		.filter((line) => line.includes(`templates/${template}/`));
	if (own.length > 0) {
		failed = true;
		console.error(`${template}:\n${own.join("\n")}`);
	} else {
		console.log(`${template}: ok`);
	}
}

rmSync(workdir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
