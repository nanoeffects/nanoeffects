// A real Chromium and a Vite dev server for the pages of the browser tests. The pages import
// `nanoeffects` from the sources, as the playground does through its alias.
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";

const src = (path: string) =>
	fileURLToPath(new URL(`../src/${path}`, import.meta.url));

const aliases = [
	["", "index.ts"],
	["/policies", "policies/index.ts"],
	["/effects", "effects/index.ts"],
	["/actions", "actions/index.ts"],
	["/trace", "trace/index.ts"],
].map(([entry, file]) => ({
	find: new RegExp(`^nanoeffects${entry}$`),
	replacement: src(file ?? ""),
}));

/** What a test sees of the page: console lines, and errors that the page raised. */
export type PageLog = {
	console: { type: string; text: string }[];
	errors: string[];
};

export type Harness = {
	/** Why the tests are skipped, or empty. */
	skipReason: string;
	/** Opens `path` (relative to the root of the server) with `beforeLoad` run in the page first. */
	open: (
		path: string,
		beforeLoad?: () => void,
	) => Promise<{ page: Page; log: PageLog }>;
	close: () => Promise<void>;
};

/**
 * Starts Chromium and a dev server on `root`. Without a browser it returns a harness with
 * `skipReason`, except on CI, where a missing browser is an error.
 */
export const startHarness = async (root: string): Promise<Harness> => {
	let browser: Browser | undefined;
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

		return {
			skipReason:
				"no Chromium: set CHROMIUM_PATH or run playwright-core install",
			open: () => Promise.reject(new Error("no browser")),
			close: async () => {},
		};
	}

	const server: ViteDevServer = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		server: { host: "127.0.0.1", port: 0 },
		resolve: { alias: aliases },
	});
	await server.listen();
	const base = server.resolvedUrls?.local[0] ?? "";

	return {
		skipReason: "",
		open: async (path, beforeLoad) => {
			const page = await browser.newPage();
			const log: PageLog = { console: [], errors: [] };
			page.on("pageerror", (error) => log.errors.push(error.message));
			page.on("console", (message) => {
				if (!message.location().url.endsWith("/favicon.ico")) {
					log.console.push({ type: message.type(), text: message.text() });
				}
			});
			if (beforeLoad) {
				await page.addInitScript(beforeLoad);
			}
			await page.goto(new URL(path, base).href);

			return { page, log };
		},
		close: async () => {
			await browser.close();
			await server.close();
		},
	};
};

// what the page script of the extension does with a call: it posts the JSON text to the window
export const extensionOnThePage = () => {
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
