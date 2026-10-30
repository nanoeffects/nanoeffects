#!/usr/bin/env node
// `npm create nanoeffects my-app`: copies a template into a new directory and writes the version
// of nanoeffects that this package was released with into its package.json.
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const templates = [
	"vanilla",
	"react",
	"vanilla-ts",
	"react-ts",
	"domains-ts",
	"vue-ts",
	"svelte-ts",
];
const defaultTemplate = "vanilla";
const defaultName = "nanoeffects-app";

/** The directory name and the template from the command line; either can be absent. */
export function parseArguments(argv) {
	const result = {};
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index] ?? "";
		if (argument === "--template" || argument === "-t") {
			result.template = argv[++index];
		} else if (argument.startsWith("--template=")) {
			result.template = argument.slice("--template=".length);
		} else if (!argument.startsWith("-") && result.directory === void 0) {
			result.directory = argument;
		}
	}
	return result;
}

/** A valid npm package name made from the name of a directory. */
export function toPackageName(directory) {
	const name = basename(resolve(directory))
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._~-]+/g, "-")
		.replace(/^[-._]+|-+$/g, "");
	return name || defaultName;
}

/** The package manager that ran the command, from `npm_config_user_agent`. */
export function packageManager(userAgent) {
	const name = (userAgent ?? "").split("/")[0];
	return ["pnpm", "yarn", "bun"].includes(name) ? name : "npm";
}

/** The lines that tell what to do next, written for one package manager. */
export function nextSteps(directory, manager) {
	const start =
		manager === "npm" || manager === "bun"
			? `${manager} run dev`
			: `${manager} dev`;
	return [`  cd ${directory}`, `  ${manager} install`, `  ${start}`];
}

function assertTemplate(template) {
	if (!templates.includes(template)) {
		throw new Error(
			`Unknown template "${template}". Choose one of: ${templates.join(", ")}.`,
		);
	}
}

function assertEmpty(target) {
	if (existsSync(target) && readdirSync(target).length > 0) {
		throw new Error(
			`The directory ${target} is not empty. Choose another name.`,
		);
	}
}

/** Copies a template into `target` and fills in the name and the nanoeffects version. */
export function createProject({ target, template, version }) {
	assertTemplate(template);
	assertEmpty(target);
	mkdirSync(target, { recursive: true });
	cpSync(join(here, "templates", template), target, { recursive: true });

	// npm drops a .gitignore from a package, so the template keeps it as _gitignore
	const ignore = join(target, "_gitignore");
	if (existsSync(ignore)) {
		renameSync(ignore, join(target, ".gitignore"));
	}

	const file = join(target, "package.json");
	const manifest = JSON.parse(readFileSync(file, "utf8"));
	manifest.name = toPackageName(target);
	manifest.dependencies.nanoeffects = `^${version}`;
	writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function askMissing(parsed, interactive, ask) {
	let { directory, template } = parsed;
	if (directory === void 0) {
		if (!interactive) {
			throw new Error("Give a directory name: create-nanoeffects <directory>");
		}
		directory = (await ask(`Project name (${defaultName}): `)) || defaultName;
	}
	if (template === void 0) {
		template = defaultTemplate;
		if (interactive) {
			const answer = await ask(
				`Template, ${templates.join(" or ")} (${defaultTemplate}): `,
			);
			template = answer || defaultTemplate;
		}
	}
	return { directory, template };
}

/**
 * Runs the command. `interactive` tells whether the input is a terminal; `ask` reads one line.
 * Throws an Error with a message for the user when it cannot go on.
 */
export async function run({
	argv,
	cwd = process.cwd(),
	userAgent = process.env.npm_config_user_agent,
	interactive = Boolean(process.stdin.isTTY),
	ask,
	print = console.log,
	version = JSON.parse(
		readFileSync(join(here, "package.json"), "utf8"),
	).version,
}) {
	const parsed = parseArguments(argv);
	const { directory, template } = await askMissing(parsed, interactive, ask);
	assertTemplate(template);
	const target = resolve(cwd, directory);
	createProject({ target, template, version });

	print(`Created ${directory} from the ${template} template. Next steps:`);
	for (const line of nextSteps(directory, packageManager(userAgent))) {
		print(line);
	}
}

async function main() {
	const reader = createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	try {
		await run({
			argv: process.argv.slice(2),
			ask: (question) => reader.question(question),
		});
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	} finally {
		reader.close();
	}
}

// npx runs the bin through a symlink: compare the real paths
if (
	process.argv[1] &&
	realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
	await main();
}
