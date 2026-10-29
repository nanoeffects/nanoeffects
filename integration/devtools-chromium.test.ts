// The Redux DevTools playground in a real Chromium, with the connect / init / send surface of the extension
// on the page, as the page script of the extension offers it: what a user's browser would receive.
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	extensionOnThePage,
	type Harness,
	startHarness,
} from "./browser-harness";

const playground = fileURLToPath(
	new URL("../examples/playground-devtools", import.meta.url),
);

let harness: Harness;

beforeAll(async () => {
	harness = await startHarness(playground);
}, 120_000);

afterAll(async () => {
	await harness?.close();
});

type Message = {
	type: string;
	name?: string;
	payload?: string;
	action?: string;
};

describe("reduxDevtools in Chromium", () => {
	it("sends the emits and the stopped calls of the playground, and nothing else", async (context) => {
		if (harness.skipReason) {
			context.skip();
		}
		const { page, log } = await harness.open("/", extensionOnThePage);
		await page.type("#query", "nano", { delay: 30 });
		await page.waitForSelector("#results li");
		const messages: Message[] = await page.evaluate(() =>
			Reflect.get(window, "__devtoolsMessages"),
		);
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
		expect(log.errors).toEqual([]);
		expect(
			log.console.filter(
				(line) => line.type === "error" || line.type === "warning",
			),
		).toEqual([]);
		await page.close();
	});
});
