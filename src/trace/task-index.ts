import type { TaskInfo } from "../core/types";

/** What the `task` hook told about one task, also a task that reports no event. */
export type KnownTask = {
	type: string;
	parentId?: number;
	source?: string;
	traceGroupId?: string;
};

export type TaskIndex = {
	/** The `task` method of a trace logger. */
	task: (info: TaskInfo) => void;
	tasks: Map<number, KnownTask>;
	clear: () => void;
};

/**
 * Remembers the tasks of a trace by id, to walk from a task to its root through
 * the ones that report nothing. A task that is renamed is updated. Over `limit`
 * (0: no limit) the oldest made task goes first, because a chain needs the
 * recent ancestors.
 */
export const createTaskIndex = (limit: number): TaskIndex => {
	const tasks = new Map<number, KnownTask>();
	// the parent of a task is a handle; its id was seen when the parent was made
	const ids = new WeakMap<object, number>();

	const task = ({ ref, parent, id, type, source, traceGroupId }: TaskInfo) => {
		ids.set(ref, id);
		const parentId = parent === void 0 ? void 0 : ids.get(parent);
		const known: KnownTask = {
			type,
			...(parentId === void 0 ? {} : { parentId }),
			...(source === void 0 ? {} : { source }),
			...(traceGroupId === void 0 ? {} : { traceGroupId }),
		};
		tasks.set(id, known);
		if (limit > 0 && tasks.size > limit) {
			const oldest = tasks.keys().next().value;
			if (oldest !== void 0) {
				tasks.delete(oldest);
			}
		}
	};

	return { task, tasks, clear: () => tasks.clear() };
};
