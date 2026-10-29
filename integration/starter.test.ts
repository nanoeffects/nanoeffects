// The starter as a user gets it: both packages packed, a project made by the packed command from
// each template, and the project built by Vite. Installing from the registry is replaced by
// the packed nanoeffects and links to the tools this repository already has, so no network is needed.
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import { build as viteBuild } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

const root = process.cwd();
let work = "";
let command = "";

const pack = (directory: string, destination: string) => {
	const output = execFileSync(
		"npm",
		["pack", "--ignore-scripts", "--silent", "--pack-destination", destination],
		{ cwd: directory },
	)
		.toString()
		.trim()
		.split("\n")
		.pop();
	return join(destination, output ?? "");
};

const unpack = (tarball: string, target: string) => {
	mkdirSync(target, { recursive: true });
	execFileSync("tar", ["-xzf", tarball, "-C", target, "--strip-components=1"]);
};

const link = (project: string, name: string) => {
	const target = join(project, "node_modules", name);
	mkdirSync(join(target, ".."), { recursive: true });
	symlinkSync(join(root, "node_modules", name), target);
};

const scaffold = (template: string) => {
	const project = join(work, `app-${template}`);
	execFileSync("node", [command, project, "--template", template], {
		cwd: work,
		stdio: "pipe",
	});
	unpack(pack(root, work), join(project, "node_modules", "nanoeffects"));
	for (const name of ["vite", "react", "react-dom", "@vitejs/plugin-react"]) {
		link(project, name);
	}
	return project;
};

const build = async (project: string) => {
	await viteBuild({ root: project, logLevel: "silent" });
	const assets = join(project, "dist", "assets");
	const script = readdirSync(assets).find((file) => file.endsWith(".js"));
	return readFileSync(join(assets, script ?? ""), "utf8");
};

beforeAll(() => {
	if (!existsSync(join(root, "dist/index.js"))) {
		execFileSync("pnpm", ["build"], { cwd: root, stdio: "ignore" });
	}
	work = mkdtempSync(join(tmpdir(), "nanoeffects-starter-"));
	const cli = join(work, "cli");
	unpack(pack(join(root, "packages/create-nanoeffects"), work), cli);
	command = join(cli, "index.js");
});

describe("create-nanoeffects", () => {
	it("makes a vanilla project that builds and runs the handler", async () => {
		const project = scaffold("vanilla");
		const manifest = JSON.parse(
			readFileSync(join(project, "package.json"), "utf8"),
		);
		expect(manifest.dependencies.nanoeffects).toMatch(/^\^\d+\.\d+\.\d+$/);

		const code = await build(project);
		const html = readFileSync(join(project, "dist", "index.html"), "utf8");
		expect(html).toContain('id="query"');

		const window = new Window();
		window.document.body.innerHTML =
			'<input id="query" /><p id="status"></p><ul id="results"></ul>';
		window.eval(code);
		const input = window.document.querySelector("input");
		if (!input) {
			throw new Error("the page has no input");
		}
		input.value = "nano";
		input.dispatchEvent(new window.Event("input"));
		// 300 ms of quiet and the 800 ms of the fake server
		await new Promise((resolve) => setTimeout(resolve, 1500));
		expect(window.document.querySelector("#status")?.textContent).toBe(
			"5 found",
		);
		await window.happyDOM.close();
	});

	it("makes a react project that builds", async () => {
		const project = scaffold("react");
		const code = await build(project);
		expect(code).toContain("search/queryChanged");
		expect(readFileSync(join(project, ".gitignore"), "utf8")).toContain(
			"node_modules",
		);
	});
});
