// The Redux DevTools playground in a real Chromium, with the connect / init / send surface of the extension
// on the page, as the page script of the extension offers it: what a user's browser would receive.
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const src = (path: string) =>
	fileURLToPath(new URL(`../src/${path}`, import.meta.url));
const playground = fileURLToPath(
	new URL("../examples/playground-devtools", import.meta.url),
);

// what the page script of the extension does with a call: it posts the JSON text to the window
const extensionOnThePage = () => {
	type Message = Record<string, unknown>;
	const messages: Message[] = [];
	const names = new Map<number, string>();
	let last = 0;
	const post = (message: Message) => {
		const posted = { source: "@devtools-page", ...message };
		messages.push(posted);
		window.postMessage(posted, "*");
	};
	Reflect.set(window, "__devtoolsMessages", messages);
	Reflect.set(window, "__REDUX_DEVTOOLS_EXTENSION__", {
		connect: (options: { name?: string } = {}) => {
			const instanceId = ++last;
			names.set(instanceId, options.name ?? "");
			return {
				init: (state: unknown) =>
					post({
						type: "INIT",
						instanceId,
						name: options.name,
						payload: JSON.stringify(state),
					}),
				send: (action: unknown, state: unknown) =>
					post({
						type: "ACTION",
						instanceId,
						name: options.name,
						action: JSON.stringify(action),
						payload: JSON.stringify(state),
					}),
				subscribe: () => () => {},
				unsubscribe: () => {},
				error: () => {},
			};
		},
	});
};

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let skipReason = "";

beforeAll(async () => {
	try {
		browser = await chromium.launch({
			...(process.env.CHROMIUM_PATH && {
				executablePath: process.env.CHROMIUM_PATH,
			}),
		});
	} catch (error) {
		if (process.env.CI) {
			throw error;
		}
		skipReason =
			"no Chromium: set CHROMIUM_PATH or run playwright-core install";
		return;
	}
	server = await createServer({
		root: playground,
		configFile: false,
		logLevel: "silent",
		server: { host: "127.0.0.1", port: 0 },
		resolve: {
			alias: [
				{ find: /^nanoeffects$/, replacement: src("index.ts") },
				{
					find: /^nanoeffects\/policies$/,
					replacement: src("policies/index.ts"),
				},
				{ find: /^nanoeffects\/trace$/, replacement: src("trace/index.ts") },
			],
		},
	});
	await server.listen();
}, 120_000);

afterAll(async () => {
	await browser?.close();
	await server?.close();
});

type Message = {
	type: string;
	name?: string;
	payload?: string;
	action?: string;
};

const open = async (problems: string[]): Promise<Page> => {
	const page = await browser?.newPage();
	if (!(page && server)) {
		throw new Error("not started");
	}
	page.on("pageerror", (error) => problems.push(error.message));
	page.on("console", (message) => {
		const isFavicon = message.location().url.endsWith("/favicon.ico");
		if (
			(message.type() === "error" || message.type() === "warning") &&
			!isFavicon
		) {
			problems.push(message.text());
		}
	});
	await page.addInitScript(extensionOnThePage);
	await page.goto(server.resolvedUrls?.local[0] ?? "");

	return page;
};

const received = async (page: Page): Promise<Message[]> =>
	page.evaluate(() => Reflect.get(window, "__devtoolsMessages"));

describe("reduxDevtools in Chromium", () => {
	it("sends the emits and the stopped calls of the playground, and nothing else", async (context) => {
		if (skipReason) {
			context.skip();
		}
		const problems: string[] = [];
		const page = await open(problems);
		await page.type("#query", "nano", { delay: 30 });
		await page.waitForSelector("#results li");
		const messages = await received(page);
		const [init, ...rest] = messages;
		const actions = rest.map((message) => JSON.parse(message.action ?? "null"));
		const types = actions.map((action) => action.type);
		const payloadsOf = (type: string) =>
			actions
				.filter((action) => action.type === type)
				.map((action) => action.payload);

		expect(init).toMatchObject({ type: "INIT", name: "search playground" });
		expect(JSON.parse(init?.payload ?? "null")).toEqual({ running: {} });
		expect(rest.every((message) => message.type === "ACTION")).toBe(true);

		// the emits, in order, with what was emitted; the results come from a ctx.emit
		expect(payloadsOf("typed")).toEqual(["n", "na", "nan", "nano"]);
		expect(payloadsOf("results")).toHaveLength(1);
		expect(payloadsOf("results")[0]).toEqual([
			{ id: 1, title: "nano (first)" },
			{ id: 2, title: "nano (second)" },
		]);

		// the calls that debounce replaced, and no other stage of a policy
		expect(types.filter((type) => type === "typed/debounce/drop")).toHaveLength(
			3,
		);
		expect(types.filter((type) => /\/(start|done)$/.test(type))).toEqual([]);

		// the dropped calls keep their payload by default, so a reader can tell which ones they were
		expect(payloadsOf("typed/debounce/drop")).toEqual(["n", "na", "nan"]);

		// the state of every action is the running tasks, as JSON
		for (const message of rest) {
			expect(JSON.parse(message.payload ?? "null")).toHaveProperty("running");
		}
		expect(problems).toEqual([]);
		await page.close();
	});
});
