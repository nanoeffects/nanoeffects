import type { Bus } from "../core/bus";
import type { EventMap } from "../core/types";

/** What a guard found when it refused an emit. */
export type LimitFinding = {
	/** `repeats`: one event is in the chain too often; `depth`: the chain is too long; `storm`: too many emits from outside any task. */
	limit: "repeats" | "depth" | "storm";
	/** The event names of the loop, from the earlier turn of the refused event to it; for a storm, the event. */
	path: string[];
};

export type LoopGuardOptions = {
	/** How many times one event may be in a chain; the emit that would pass it is refused. Default 50. */
	maxRepeats?: number;
	/** How many emits long a chain may be, whatever the names are. Default 1000. */
	maxDepth?: number;
	/** Events from outside any task, per second, for each type; over it they are refused. Default: no limit. */
	maxPerSecond?: number;
	/** Event names (or a predicate) that the repeat count skips; `maxDepth` still applies. */
	ignore?: readonly string[] | ((name: string) => boolean);
	/** What to do with a refused emit: `"drop"` does not send it (default), `"throw"` throws a `LoopError` from it. */
	onLimit?: "drop" | "throw";
	/** Receives each finding once for a path. Default: `console.error` with the path. */
	report?: (finding: LimitFinding) => void;
	/** The clock for `maxPerSecond`, in ms. Default `performance.now`. */
	now?: () => number;
};

/** Thrown by an emit that the guard refused, with `onLimit: "throw"`. */
export class LoopError extends Error {
	readonly limit: LimitFinding["limit"];
	readonly path: string[];

	constructor(finding: LimitFinding) {
		super(`event loop stopped (${finding.limit}): ${finding.path.join(" → ")}`);
		this.name = "LoopError";
		this.limit = finding.limit;
		this.path = finding.path;
	}
}

// what a task is in a chain of emits
type Link = {
	type: string;
	parent?: Link | undefined;
	depth: number;
	// a task that `ctx.run` made inside a handler is the handler again, so it is not a step
	inner: boolean;
};

type Emitter = (event: unknown, ...rest: unknown[]) => unknown;
type Context = {
	type: string;
	emit: Emitter;
	run: (...args: unknown[]) => unknown;
};

// an event is a string, or an object, a creator or an action that has a `type`
const keyOf = (event: unknown) =>
	typeof event === "string"
		? event
		: String(Reflect.get(Object(event), "type"));

const matcherOf = (ignore: LoopGuardOptions["ignore"]) => {
	if (typeof ignore === "function") {
		return ignore;
	}
	const names = new Set(ignore);

	return (name: string) => names.has(name);
};

// how many of the steps above `link` are `type`
const timesIn = (link: Link | undefined, type: string) => {
	let times = 0;
	for (let up = link; up; up = up.parent) {
		if (!up.inner && up.type === type) {
			times += 1;
		}
	}

	return times;
};

// the event names from the earlier turn of `type` down to the refused emit
const pathOf = (link: Link | undefined, type: string) => {
	const between: string[] = [];
	for (let up = link; up; up = up.parent) {
		if (up.inner) {
			continue;
		}
		between.push(up.type);
		if (up.type === type) {
			break;
		}
	}

	return [...between.reverse(), type];
};

/**
 * Cuts a loop while the app runs. It follows the chain of emits that `ctx.emit`
 * makes, across `await` and timers, and refuses the emit that would pass a limit:
 * the same event too often in one chain (`maxRepeats`), or a chain too long
 * (`maxDepth`). Nothing else is touched: other chains go on, and the next emit
 * from outside starts a fresh chain.
 *
 * A refused emit is not sent (`onLimit: "drop"`, the default) or throws a
 * `LoopError`, and is always reported once for each path. The state of the app can
 * be half done when a loop is cut. The plugin needs no tracer and nothing else, so
 * it can stay on in production as a safety net. Returns the same bus.
 *
 * A chain that repeats on purpose (a handler that emits the same event again after
 * a timer, forever) is cut too: list its event in `ignore`.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { loopGuardPlugin } from "nanoeffects/guard";
 *
 * const bus = createBus().use(
 *   loopGuardPlugin({ maxRepeats: 50, onLimit: "drop" }),
 * );
 * ```
 */
export const loopGuardPlugin =
	(options: LoopGuardOptions = {}) =>
	<E extends EventMap>(bus: Bus<E>): Bus<E> => {
		const maxRepeats = options.maxRepeats ?? 50;
		const maxDepth = options.maxDepth ?? 1000;
		const onLimit = options.onLimit ?? "drop";
		const ignored = matcherOf(options.ignore);
		const now = options.now ?? (() => globalThis.performance.now());
		const links = new WeakMap<object, Link>();
		const told = new Set<string>();
		const windows = new Map<string, number[]>();

		// the task whose `emit` or `run` is running now, set around the synchronous part of the call
		let current: Link | undefined;
		let viaRun = false;

		const tell = (finding: LimitFinding) => {
			const key = `${finding.limit}:${finding.path.join("\u0000")}`;
			if (!told.has(key)) {
				told.add(key);
				try {
					(options.report ?? defaultReport)(finding);
				} catch (error) {
					globalThis.console?.error(
						"[nanoeffects] loop guard report failed",
						error,
					);
				}
			}
		};

		const refuse = (finding: LimitFinding) => {
			tell(finding);
			if (onLimit === "throw") {
				throw new LoopError(finding);
			}
		};

		// true when the emit may go on
		const allows = (type: string) => {
			if (!current) {
				return outsideAllows(type);
			}
			if (current.depth + 1 > maxDepth) {
				refuse({ limit: "depth", path: pathOf(current, type).slice(-20) });

				return false;
			}
			if (!ignored(type) && timesIn(current, type) >= maxRepeats) {
				refuse({ limit: "repeats", path: pathOf(current, type) });

				return false;
			}

			return true;
		};

		const outsideAllows = (type: string) => {
			const limit = options.maxPerSecond;
			if (limit === void 0) {
				return true;
			}
			const at = now();
			const recent = (windows.get(type) ?? []).filter(
				(time) => at - time < 1000,
			);
			if (recent.length >= limit) {
				windows.set(type, recent);
				refuse({ limit: "storm", path: [type] });

				return false;
			}
			recent.push(at);
			windows.set(type, recent);

			return true;
		};

		const previous = bus.addContext;
		bus.addContext = (target) => {
			previous?.(target);
			const task = target as Context;
			const parent = current;
			const inner = viaRun && parent !== void 0;
			const link: Link = {
				type: task.type,
				parent,
				depth: parent ? parent.depth + (inner ? 0 : 1) : 0,
				inner,
			};
			links.set(target, link);

			// the emit and the run of this task name it as the one that is running while they work
			const emitOf = task.emit;
			task.emit = (event, ...rest) => {
				const outer = current;
				current = link;
				try {
					return emitOf(event, ...rest);
				} finally {
					current = outer;
				}
			};
			const runOf = task.run;
			task.run = (...args) => {
				const outer = current;
				const outerVia = viaRun;
				current = link;
				viaRun = true;
				try {
					return runOf(...args);
				} finally {
					current = outer;
					viaRun = outerVia;
				}
			};
		};

		const emit = bus.emit as Emitter;
		const guarded: Emitter = (event, ...rest) => {
			if (!allows(keyOf(event))) {
				return;
			}
			// the tasks this emit starts are steps of the chain, not `ctx.run` children
			const outerVia = viaRun;
			viaRun = false;
			try {
				return emit(event, ...rest);
			} finally {
				viaRun = outerVia;
			}
		};
		bus.emit = guarded as typeof bus.emit;

		return bus;
	};

const defaultReport = (finding: LimitFinding) => {
	globalThis.console?.error(
		`[nanoeffects] loop guard: ${finding.limit} limit reached: ${finding.path.join(" → ")}. The emit was refused.`,
	);
};
