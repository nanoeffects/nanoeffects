import { describe, expect, it } from "vitest";
import type { TaskInfo } from "../core/types";
import { createTaskIndex } from "./task-index";

const info = (patch: Partial<TaskInfo> & { id: number }): TaskInfo => ({
	ref: {},
	type: "x",
	...patch,
});

describe("createTaskIndex", () => {
	it("links a task to the id of its parent", () => {
		const index = createTaskIndex(0);
		const root = info({ id: 1 });
		index.task(root);
		index.task(info({ id: 2, parent: root.ref }));

		expect(index.tasks.get(2)?.parentId).toBe(1);
	});

	it("keeps every task without a limit", () => {
		const index = createTaskIndex(0);
		for (let id = 1; id <= 1500; id += 1) {
			index.task(info({ id }));
		}

		expect(index.tasks.size).toBe(1500);
	});

	it("drops the oldest task over the limit", () => {
		const index = createTaskIndex(1000);
		for (let id = 1; id <= 1500; id += 1) {
			index.task(info({ id }));
		}

		expect(index.tasks.size).toBe(1000);
		expect(index.tasks.has(500)).toBe(false);
		expect(index.tasks.has(501)).toBe(true);
	});

	it("has no parent when the parent was not seen", () => {
		const index = createTaskIndex(0);
		index.task(info({ id: 2, parent: {} }));

		expect(index.tasks.get(2)).toEqual({ type: "x" });
	});
});
