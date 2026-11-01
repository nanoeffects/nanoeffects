import type { LostSignal } from "./types";

// the part of AsyncLocalStorage that the tracker uses
type Storage = {
	getStore: () => unknown;
	enterWith: (store: unknown) => void;
};

type Task = {
	type: string;
	signal: AbortSignal;
	run: (...args: unknown[]) => unknown;
};

type Tracked = {
	url: string;
	signal: AbortSignal | undefined;
	settled: boolean;
	counted: boolean;
};

type Host = {
	process?: { getBuiltinModule?: (id: string) => unknown };
};

// AsyncLocalStorage comes from `process.getBuiltinModule`, not from an import, so a bundler for the browser has
// nothing to resolve; where there is none (a browser, an old Node) the requests are not followed
const createStorage = (): Storage | null => {
	const host: Host = globalThis;
	const builtin = host.process?.getBuiltinModule;
	const loaded = builtin?.("node:async_hooks");
	const make = (loaded as { AsyncLocalStorage?: new () => Storage } | undefined)
		?.AsyncLocalStorage;

	return make ? new make() : null;
};

const urlOf = (input: unknown) => {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}

	return String(Reflect.get(Object(input), "url"));
};

const signalOf = (input: unknown, init: RequestInit | undefined) => {
	if (init?.signal) {
		return init.signal;
	}
	const isRequest = typeof Request === "function" && input instanceof Request;

	return isRequest ? input.signal : void 0;
};

/**
 * Follows the `fetch` requests of the tasks of a bus. A request is attributed to the task that was running when it
 * was made, also after `await` (AsyncLocalStorage). When that task is aborted, a request that is still running and
 * did not stop with the abort is a lost signal. Returns `null` where the tracking is not possible.
 */
export const trackRequests = (
	bus: { emit: (...args: never[]) => unknown },
	lost: LostSignal[],
	warn: (message: string) => void,
) => {
	const storage = createStorage();
	const original = globalThis.fetch;
	if (!storage || typeof original !== "function") {
		return null;
	}
	const told = new Set<string>();
	const requestsOf = new WeakMap<object, Tracked[]>();

	// a microtask after the abort, so the signals that follow the task signal have aborted too
	const check = (task: Task) => {
		for (const request of requestsOf.get(task) ?? []) {
			if (request.counted || request.settled || request.signal?.aborted) {
				continue;
			}
			request.counted = true;
			lost.push({ kind: "request", handler: task.type, event: request.url });
			const key = `${task.type}\u0000${request.url}`;
			if (!told.has(key)) {
				told.add(key);
				warn(
					`[nanoeffects] the handler of "${task.type}" has a request to "${request.url}" that kept running after its task was aborted. ` +
						"Pass ctx.signal to it (fetch(url, { signal: ctx.signal })), or make it through a client bound with fromSignal.",
				);
			}
		}
	};

	const note = (
		task: Task,
		input: unknown,
		init: RequestInit | undefined,
		answer: Promise<unknown>,
	) => {
		const request: Tracked = {
			url: urlOf(input),
			signal: signalOf(input, init),
			settled: false,
			counted: false,
		};
		const done = () => {
			request.settled = true;
		};
		answer.then(done, done);
		const later = () => check(task);
		const known = requestsOf.get(task);
		if (known) {
			known.push(request);
		} else {
			requestsOf.set(task, [request]);
			const afterAbort = () => queueMicrotask(later);
			task.signal.addEventListener("abort", afterAbort, { once: true });
		}
		// a task that was aborted already: a late step of a handler that did not stop
		if (task.signal.aborted) {
			queueMicrotask(later);
		}
	};

	const patched: typeof fetch = (input, init) => {
		const task = storage.getStore() as Task | undefined;
		const answer = original(input, init);
		if (task) {
			note(task, input, init, answer);
		}

		return answer;
	};
	globalThis.fetch = patched;

	// the code that called `bus.emit` gets its own context back when the synchronous call returns
	const emit = bus.emit;
	const guarded = (...args: never[]) => {
		const before = storage.getStore();
		try {
			return emit(...args);
		} finally {
			storage.enterWith(before);
		}
	};
	bus.emit = guarded;

	return {
		// the task is the context of the code that runs next: its handler, and what the handler awaits
		enter(task: Task) {
			storage.enterWith(task);
			const run = task.run;
			task.run = (...args) => {
				const before = storage.getStore();
				try {
					return run(...args);
				} finally {
					storage.enterWith(before);
				}
			};
		},
		stop() {
			if (globalThis.fetch === patched) {
				globalThis.fetch = original;
			}
			if (bus.emit === guarded) {
				bus.emit = emit;
			}
		},
	};
};
