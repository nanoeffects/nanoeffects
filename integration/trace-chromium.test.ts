// The trace in a real Chromium: tracePlugin with the console, the Performance and the Redux DevTools
// loggers on one page (integration/fixtures/trace), and the same page with the plugin left out.
import { fileURLToPath } from "node:url";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	extensionOnThePage,
	type Harness,
	type PageLog,
	startHarness,
} from "./browser-harness";

let harness: Harness;

beforeAll(async () => {
	harness = await startHarness(
		fileURLToPath(new URL("./fixtures/trace", import.meta.url)),
	);
}, 120_000);

afterAll(async () => {
	await harness?.close();
});

type Action = {
	type: string;
	id: number;
	parentId?: number;
	traceGroupId?: string;
	error?: string;
};
type Entry = {
	kind: "measure" | "mark";
	name: string;
	detail: {
		id: number;
		parentId?: number;
		rootId?: number;
		traceGroupId?: string;
	};
};

// runs the flow of the page and reads what each logger left
const runFlow = async (plugin: "on" | "off") => {
	const { page, log } = await harness.open(
		`/?plugin=${plugin}`,
		extensionOnThePage,
	);
	const result = await page.evaluate(() => Reflect.get(window, "runFlow")());

	return { result: result as string, log, ...(await readLoggers(page)) };
};

const readLoggers = async (page: Page) => {
	const messages: { action?: string }[] = await page.evaluate(() =>
		Reflect.get(window, "__devtoolsMessages"),
	);
	const entries: Entry[] = await page.evaluate(() => [
		...performance.getEntriesByType("measure").map((entry) => ({
			kind: "measure" as const,
			name: entry.name,
			detail: (entry as PerformanceMeasure).detail,
		})),
		...performance.getEntriesByType("mark").map((entry) => ({
			kind: "mark" as const,
			name: entry.name,
			detail: (entry as PerformanceMark).detail,
		})),
	]);
	const actions: Action[] = messages
		.filter((message) => message.action)
		.map((message) => JSON.parse(message.action ?? "null"));

	return { actions, entries };
};

// the lines of the console logger, without the ones of Vite
const linesOf = (log: PageLog) =>
	log.console
		.filter((line) => line.text.startsWith("[nanoeffects]"))
		.map((line) => line.text);

describe("the trace in Chromium", () => {
	it("tracePlugin names the emits, the listener and the flow in all three loggers", async (context) => {
		if (harness.skipReason) {
			context.skip();
		}
		const { result, log, actions, entries } = await runFlow("on");
		const lines = linesOf(log);
		const entry = (kind: Entry["kind"], name: string) =>
			entries.find((found) => found.kind === kind && found.name === name);
		const saveCart = entry("measure", "saveCart · run (done)");

		expect(result).toBe("paid 5");
		expect(log.errors).toEqual([]);

		// console: the emit, the named listener, the group on every task of the flow, the failed attempt
		expect(
			lines.some((line) => line.includes("cart/changed · emit done")),
		).toBe(true);
		expect(lines.some((line) => line.includes("saveCart · run start"))).toBe(
			true,
		);
		const flowLines = lines.filter((line) => line.includes("checkout/pay · "));
		expect(flowLines.length).toBeGreaterThan(5);
		expect(flowLines.every((line) => line.includes("[checkout]"))).toBe(true);
		const failures = log.console.filter((line) => line.type === "error");
		expect(failures).toHaveLength(1);
		expect(failures[0]?.text).toContain("run error");
		expect(failures[0]?.text).toContain("declined");
		expect(log.console.filter((line) => line.type === "warning")).toEqual([]);

		// performance: a mark for each emit, the flow's measures have the group and the root
		const payEmit = entry("mark", "checkout/pay · emit (done)");
		expect(entry("mark", "cart/changed · emit (done)")).toBeDefined();
		expect(payEmit?.detail.traceGroupId).toBe("checkout");
		// the command is emitted with ctx.emit: the named listener is its parent
		expect(payEmit?.detail.parentId).toBe(saveCart?.detail.id);
		const pay = entry("measure", "checkout/pay · command (done)");
		expect(pay?.detail).toMatchObject({
			traceGroupId: "checkout",
			rootId: saveCart?.detail.id,
		});

		// Redux DevTools: the top-level emit has no parent, the listener has its name, the flow its group
		const types = actions.map((action) => action.type);
		expect(actions[0]).toMatchObject({ type: "cart/changed" });
		expect(actions[0]?.parentId).toBeUndefined();
		expect(types).toContain("saveCart/run/done");
		const retryDone = actions.find(
			(action) => action.type === "checkout/pay/retry/done",
		);
		expect(retryDone?.traceGroupId).toBe("checkout");
		const declined = actions.find(
			(action) => action.type === "checkout/pay/run/error",
		);
		expect(declined?.error).toBe("declined");
	});

	it("without tracePlugin the same flow runs the same and the names are ignored", async (context) => {
		if (harness.skipReason) {
			context.skip();
		}
		const on = await runFlow("on");
		const off = await runFlow("off");
		const lines = linesOf(off.log);

		// the same result, and no error on the page
		expect(off.result).toBe(on.result);
		expect(off.log.errors).toEqual([]);

		// no emit events, no listener name, no group
		expect(lines.some((line) => line.includes(" · emit "))).toBe(false);
		expect(lines.some((line) => line.includes("saveCart"))).toBe(false);
		expect(lines.some((line) => line.includes("[checkout]"))).toBe(false);
		expect(off.entries.some((found) => found.kind === "mark")).toBe(false);
		expect(off.actions.some((action) => action.traceGroupId)).toBe(false);
		expect(off.actions.map((action) => action.type)).not.toContain(
			"cart/changed",
		);

		// the task of the flow is still traced, only under the type of its event
		expect(off.actions.map((action) => action.type)).toContain(
			"checkout/pay/command/done",
		);

		// reduxDevtools says once what is missing
		const warnings = off.log.console.filter((line) => line.type === "warning");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.text).toContain("tracePlugin");
	});
});
