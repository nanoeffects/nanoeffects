import { type Context, createBus } from "./bus";
import { createTraceRecorder } from "./trace/recorder";
import { createTracer } from "./trace/tracer";

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
		const off = bus.on("t", (_, c) => {
			got.push(c);
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
	const phases = () => recorder.events.map((e) => `${e.effect}/${e.phase}`);

	return { bus, recorder, ctx, phases };
};

/** A payload that is `undefined` at runtime, for events without data. */
export const noPayload = Reflect.get({}, "none");
