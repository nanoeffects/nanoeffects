import v8 from "node:v8";
import vm from "node:vm";
import { type Module, modulePlugin } from "../actions";
import { type BusOptions, type Context, createBus } from "../core/bus";
import type { EventMap } from "../core/types";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";

export type TestEvents = { t: number; b: string };

export type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};

export const deferred = <T = void>(): Deferred<T> => {
	let resolve: Deferred<T>["resolve"] = () => {};
	let reject: Deferred<T>["reject"] = () => {};
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

/** A bus that records its trace, and a way to get fresh bus task contexts. */
export const createHarness = () => {
	const recorder = createTraceRecorder<TestEvents>();
	const bus = createBus<TestEvents>({ trace: createTracer(recorder) });

	/** A new task context: each call emits `t` and captures the handler context. */
	const ctx = (payload = 0): Context<TestEvents> => {
		const got: Context<TestEvents>[] = [];
		const off = bus.on("t", (_, ctx) => {
			got.push(ctx);
		});
		bus.emit("t", payload);
		off();
		const [captured] = got;
		if (!captured) {
			throw new Error("test harness captured no context");
		}
		return captured;
	};

	/** `effect/phase` of every traced event, in order. */
	const phases = () =>
		recorder.events.map((event) => `${event.effect}/${event.phase}`);

	return { bus, recorder, ctx, phases };
};

/** A payload that is `undefined` at runtime, for events without data. */
export const noPayload = Reflect.get({}, "none");

/** A bus with `modulePlugin`, and its parts at hand, for tests of modules and commands. */
export const createApp = <E extends EventMap = EventMap>(
	options: Omit<BusOptions<E>, "commands"> & {
		modules?: readonly Module<E>[];
	} = {},
) => {
	const { modules, ...busOptions } = options;
	const bus = createBus<E>(busOptions);
	const app = bus.use(modulePlugin(modules));

	return { bus, ...app };
};

// Node hands out `gc` to a script when asked for it at run time, so no flag is needed to run the tests
const runGc = (): (() => void) => {
	if (typeof globalThis.gc === "function") {
		return globalThis.gc;
	}
	v8.setFlagsFromString("--expose-gc");
	const found: unknown = vm.runInNewContext("gc");
	if (typeof found !== "function") {
		throw new Error(
			"a leak test needs a garbage collector, and Node did not give one",
		);
	}

	return found as () => void;
};

/**
 * Lets the engine collect what nothing holds any more. Garbage is not gone at the first
 * try, so it waits a tick and collects a few times. Throws when there is no `gc`: a leak
 * test that cannot collect would pass for nothing.
 */
export const settleGarbage = async () => {
	const collect = runGc();
	for (let round = 0; round < 5; round++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		collect();
	}
};

/** How many of the objects that `refs` point to are still alive. */
export const aliveCount = (refs: ReadonlyArray<WeakRef<object>>) =>
	refs.filter((ref) => ref.deref() !== void 0).length;
