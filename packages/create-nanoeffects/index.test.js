import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createProject,
	nextSteps,
	packageManager,
	parseArguments,
	run,
	templates,
	toPackageName,
} from "./index.js";

let workdir = "";
let printed = [];

const print = (line) => printed.push(line);
const read = (...parts) => readFileSync(join(workdir, ...parts), "utf8");
const manifestOf = (directory) => JSON.parse(read(directory, "package.json"));

beforeEach(() => {
	workdir = mkdtempSync(join(tmpdir(), "create-nanoeffects-"));
	printed = [];
});

describe("parseArguments", () => {
	it("reads the directory and the template in any order", () => {
		expect(parseArguments(["--template", "react", "app"])).toEqual({
			directory: "app",
			template: "react",
		});
		expect(parseArguments(["app", "--template=vanilla"])).toEqual({
			directory: "app",
			template: "vanilla",
		});
		expect(parseArguments([])).toEqual({});
	});
});

describe("run with arguments", () => {
	it("copies the template, with a .gitignore, and asks nothing", async () => {
		const ask = () => {
			throw new Error("asked");
		};
		await run({
			argv: ["my-app", "--template", "vanilla"],
			cwd: workdir,
			interactive: true,
			ask,
			print,
			version: "0.17.0",
		});
		expect(existsSync(join(workdir, "my-app", "src", "bus.js"))).toBe(true);
		expect(existsSync(join(workdir, "my-app", ".gitignore"))).toBe(true);
		expect(existsSync(join(workdir, "my-app", "_gitignore"))).toBe(false);
	});

	it("names the package after the directory", async () => {
		await run({
			argv: ["My App", "-t", "react"],
			cwd: workdir,
			interactive: false,
			print,
			version: "0.17.0",
		});
		expect(manifestOf("My App").name).toBe("my-app");
	});

	it("writes a range that accepts the version of the command", async () => {
		for (const template of templates) {
			await run({
				argv: [template, "-t", template],
				cwd: workdir,
				interactive: false,
				print,
				version: "0.17.0",
			});
			expect(manifestOf(template).dependencies.nanoeffects).toBe("^0.17.0");
		}
	});
});

describe("run without arguments", () => {
	it("asks for the template in a terminal and lists the known ones", async () => {
		const questions = [];
		const ask = async (question) => {
			questions.push(question);
			return "react";
		};
		await run({
			argv: ["my-app"],
			cwd: workdir,
			interactive: true,
			ask,
			print,
			version: "0.17.0",
		});
		expect(questions).toHaveLength(1);
		expect(questions[0]).toContain("vanilla");
		for (const template of templates) {
			expect(questions[0]).toContain(template);
		}
		expect(read("my-app", "src", "App.jsx")).toContain("useEmitter");
	});

	it("asks for the name in a terminal", async () => {
		const answers = ["asked-app", ""];
		const ask = async () => answers.shift();
		await run({
			argv: [],
			cwd: workdir,
			interactive: true,
			ask,
			print,
			version: "0.17.0",
		});
		expect(existsSync(join(workdir, "asked-app", "package.json"))).toBe(true);
	});

	it("fails without a terminal and without a name", async () => {
		await expect(
			run({
				argv: [],
				cwd: workdir,
				interactive: false,
				print,
				version: "0.17.0",
			}),
		).rejects.toThrow("directory name");
	});

	it("uses the default template without a terminal", async () => {
		await run({
			argv: ["quiet"],
			cwd: workdir,
			interactive: false,
			print,
			version: "0.17.0",
		});
		expect(existsSync(join(workdir, "quiet", "src", "main.js"))).toBe(true);
	});
});

describe("refusals", () => {
	it("leaves a directory with files unchanged", async () => {
		const target = join(workdir, "taken");
		mkdirSync(target);
		writeFileSync(join(target, "keep.txt"), "mine");
		await expect(
			run({
				argv: ["taken"],
				cwd: workdir,
				interactive: false,
				print,
				version: "0.17.0",
			}),
		).rejects.toThrow("not empty");
		expect(read("taken", "keep.txt")).toBe("mine");
		expect(existsSync(join(target, "package.json"))).toBe(false);
	});

	it("accepts an existing empty directory", () => {
		const target = join(workdir, "empty");
		mkdirSync(target);
		createProject({ target, template: "vanilla", version: "0.17.0" });
		expect(existsSync(join(target, "package.json"))).toBe(true);
	});

	it("names the known templates when the template is unknown", async () => {
		await expect(
			run({
				argv: ["app", "--template", "angular"],
				cwd: workdir,
				interactive: false,
				print,
				version: "0.17.0",
			}),
		).rejects.toThrow(/vanilla, react, vanilla-ts, react-ts, domains-ts/);
		expect(existsSync(join(workdir, "app"))).toBe(false);
	});
});

describe("next steps", () => {
	it("is written for the package manager that ran the command", async () => {
		await run({
			argv: ["app"],
			cwd: workdir,
			interactive: false,
			userAgent: "pnpm/11.0.0 npm/? node/v24.0.0 darwin arm64",
			print,
			version: "0.17.0",
		});
		expect(printed).toContain("  pnpm install");
		expect(printed).toContain("  pnpm dev");
	});

	it("falls back to npm", () => {
		expect(packageManager(void 0)).toBe("npm");
		expect(nextSteps("app", "npm")).toEqual([
			"  cd app",
			"  npm install",
			"  npm run dev",
		]);
		expect(nextSteps("app", "yarn")).toContain("  yarn dev");
	});
});

describe("toPackageName", () => {
	it("makes a valid name", () => {
		expect(toPackageName("/tmp/My Cool_App!")).toBe("my-cool_app");
		expect(toPackageName("/tmp/---")).toBe("nanoeffects-app");
	});
});

describe("templates", () => {
	const sourceExtension = (template) =>
		template.endsWith("-ts") ? "ts" : "js";

	it("are the four known names, with vanilla as the default", () => {
		expect(templates).toEqual([
			"vanilla",
			"react",
			"vanilla-ts",
			"react-ts",
			"domains-ts",
		]);
	});

	it("keep the bus, the events and the handlers apart", () => {
		for (const template of templates.filter((name) => name !== "domains-ts")) {
			const target = join(workdir, `layout-${template}`);
			createProject({ target, template, version: "0.17.0" });
			const source = (name) =>
				readFileSync(
					join(target, "src", `${name}.${sourceExtension(template)}`),
					"utf8",
				);
			expect(source("bus")).not.toMatch(/from "\.\/search/);
			expect(source("search")).not.toMatch(/from "\.\/bus/);
			expect(source("search-handlers")).toMatch(/from "\.\/bus"/);
			expect(source("search-handlers")).toMatch(/from "\.\/search"/);
		}
	});

	it("split domains-ts by domain, with the bus and the events apart", () => {
		const target = join(workdir, "domains");
		createProject({ target, template: "domains-ts", version: "0.17.0" });
		const source = (...parts) =>
			readFileSync(join(target, "src", ...parts), "utf8");

		expect(source("bus.ts")).not.toMatch(/from "\.\/domains/);
		for (const domain of readdirSync(join(target, "src", "domains"))) {
			const files = readdirSync(join(target, "src", "domains", domain));
			expect(files).toContain(`${domain}.ts`);
			expect(files).toContain(`${domain}-handlers.ts`);
			expect(files).toContain(`${domain}-module.ts`);
			expect(source("domains", domain, `${domain}.ts`)).not.toMatch(
				/from "(\.\.\/)+bus"/,
			);
			expect(source("domains", domain, `${domain}-module.ts`)).toMatch(
				/createModule/,
			);
		}
		expect(readdirSync(join(target, "src", "domains")).sort()).toEqual([
			"catalog",
			"checkout",
		]);
		expect(source("ui", "ProductsProvider.tsx")).toMatch(/not a global store/);
	});

	it("make a TypeScript project from react-ts", async () => {
		await run({
			argv: ["my-app", "--template", "react-ts"],
			cwd: workdir,
			interactive: false,
			print,
			version: "0.17.0",
		});
		expect(existsSync(join(workdir, "my-app", ".gitignore"))).toBe(true);
		expect(read("my-app", "tsconfig.json")).toContain("react-jsx");
		expect(manifestOf("my-app").scripts.build).toBe(
			"tsc --noEmit && vite build",
		);
		expect(read("my-app", "src", "search.ts")).toContain(
			"createAction<string[]>",
		);
		expect(manifestOf("my-app").name).toBe("my-app");
	});

	it("give each TypeScript template the files of its JavaScript twin", () => {
		const names = (template) => {
			const target = join(workdir, `files-${template}`);
			createProject({ target, template, version: "0.17.0" });
			const files = [
				...readdirSync(target),
				...readdirSync(join(target, "src")).map((file) => `src/${file}`),
			];
			return files
				.map((file) => file.replace(/\.(jsx?|tsx?)$/, ""))
				.filter((file) => file !== "tsconfig.json")
				.sort();
		};
		expect(names("vanilla-ts")).toEqual(names("vanilla"));
		expect(names("react-ts")).toEqual(names("react"));
	});
});
