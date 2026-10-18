import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Context, createBus } from "./bus";
import { all, delay, race } from "./effects";
import { debounce, latest, leading } from "./policies";
import { createTraceRecorder } from "./trace/recorder";
import { createTracer } from "./trace/tracer";
import type { Task } from "./types";

type Events = {
	search: string;
	results: string[];
	login: string;
	logout: string;
	save: string;
	poll: string;
	load: string;
	log: string;
};

const setup = () => {
	const recorder = createTraceRecorder<Events>();
	const bus = createBus<Events>({ trace: createTracer(recorder) });
	const phases = () => recorder.events.map((e) => `${e.effect}/${e.phase}`);
	return { bus, recorder, phases };
};

/** A cancellable request: resolves with `[value]` after `ms`, rejects on abort. */
const request = (value: string, signal: AbortSignal, ms: number) =>
	new Promise<string[]>((resolve, reject) => {
		const timer = setTimeout(() => resolve([value]), ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});

describe("flows", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("search as you type: debounce + latest fetch, stale requests aborted", async () => {
		const { bus, phases } = setup();
		const results: string[][] = [];
		const aborted: string[] = [];
		bus.on("results", (r) => results.push(r));
		bus.on(
			"search",
			debounce(300, async (query, ctx) => {
				try {
					ctx.emit("results", await request(query, ctx.signal, 200));
				} catch (error) {
					if (!ctx.signal.aborted) {
						throw error;
					}
					aborted.push(query);
				}
			}),
		);

		bus.emit("search", "r");
		await vi.advanceTimersByTimeAsync(100);
		bus.emit("search", "re");
		await vi.advanceTimersByTimeAsync(100);
		bus.emit("search", "red");
		await vi.advanceTimersByTimeAsync(350);
		bus.emit("search", "redu");
		await vi.advanceTimersByTimeAsync(2000);

		expect(aborted).toEqual(["red"]);
		expect(results).toEqual([["redu"]]);
		expect(phases().filter((p) => p === "debounce/drop")).toHaveLength(2);
		expect(phases().filter((p) => p === "debounce/cancel")).toHaveLength(1);
		expect(phases().filter((p) => p === "debounce/done")).toHaveLength(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("cancel a login flow from outside: logout aborts the running steps", async () => {
		const { bus } = setup();
		const steps: string[] = [];
		const tasks: Context<Events>[] = [];
		bus.on(
			"login",
			leading(async (user, ctx) => {
				tasks.push(ctx);
				try {
					await ctx.run(() => delay(100, ctx).then(() => steps.push("token")));
					await ctx.run(() =>
						delay(100, ctx).then(() => steps.push("profile")),
					);
					steps.push(`done ${user}`);
				} catch {
					steps.push("aborted");
				}
			}),
		);
		bus.on("logout", () => tasks[0]?.abort("logout"));

		bus.emit("login", "ann");
		await vi.advanceTimersByTimeAsync(100);
		bus.emit("logout", "ann");
		await vi.advanceTimersByTimeAsync(500);

		expect(steps).toEqual(["token", "aborted"]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("a new login works after the previous one was cancelled", async () => {
		const { bus } = setup();
		const steps: string[] = [];
		const tasks: Context<Events>[] = [];
		bus.on(
			"login",
			leading(async (user, ctx) => {
				tasks.push(ctx);
				try {
					await delay(100, ctx);
					steps.push(`done ${user}`);
				} catch {
					steps.push(`aborted ${user}`);
				}
			}),
		);
		bus.on("logout", () => tasks[0]?.abort());

		bus.emit("login", "ann");
		bus.emit("logout", "ann");
		await vi.advanceTimersByTimeAsync(10);
		bus.emit("login", "bob");
		await vi.advanceTimersByTimeAsync(100);

		expect(steps).toEqual(["aborted ann", "done bob"]);
	});

	it("retry loop with a cancellable delay stops when the task is aborted", async () => {
		const { bus } = setup();
		let attempts = 0;
		const tasks: Context<Events>[] = [];
		bus.on("load", async (_, ctx) => {
			tasks.push(ctx);
			try {
				for (let i = 0; i < 5; i++) {
					attempts++;
					await delay(1000, ctx);
				}
			} catch {}
		});

		bus.emit("load", "x");
		await vi.advanceTimersByTimeAsync(2500);
		tasks[0]?.abort();
		await vi.advanceTimersByTimeAsync(10_000);

		expect(attempts).toBe(3);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("a poller stops with its task", async () => {
		const { bus } = setup();
		let polls = 0;
		const tasks: Context<Events>[] = [];
		bus.on("poll", async (_, ctx) => {
			tasks.push(ctx);
			while (!ctx.signal.aborted) {
				polls++;
				await delay(100, ctx).catch(() => {});
			}
		});

		bus.emit("poll", "x");
		await vi.advanceTimersByTimeAsync(350);
		tasks[0]?.abort();
		await vi.advanceTimersByTimeAsync(1000);

		expect(polls).toBe(4);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("double submit: the second click is dropped, a retry after failure is allowed", async () => {
		const { bus, phases } = setup();
		const saved: string[] = [];
		let fail = true;
		bus.on(
			"save",
			leading(async (draft, ctx) => {
				try {
					await ctx.run(() => delay(100, ctx));
					if (fail) {
						throw new Error("offline");
					}
					saved.push(draft);
				} catch {}
			}),
		);

		bus.emit("save", "v1");
		bus.emit("save", "v1");
		await vi.advanceTimersByTimeAsync(100);
		fail = false;
		bus.emit("save", "v1");
		await vi.advanceTimersByTimeAsync(100);

		expect(saved).toEqual(["v1"]);
		expect(phases().filter((p) => p === "leading/drop")).toHaveLength(1);
		expect(phases().filter((p) => p === "leading/start")).toHaveLength(2);
	});

	it("cancel propagates through all, race and run to every leaf", async () => {
		const { bus, recorder } = setup();
		const signals: AbortSignal[] = [];
		const track = ({ signal }: { signal: AbortSignal }) => {
			signals.push(signal);
			return delay(10_000, { signal });
		};
		const tasks: Context<Events>[] = [];
		bus.on("load", async (_, ctx) => {
			tasks.push(ctx);
			try {
				await all(
					{
						a: track,
						b: () => race({ x: track, y: track }, ctx),
						c: () => ctx.run((_: string, child) => all([track], child), "c"),
					},
					ctx,
				);
			} catch {}
		});

		bus.emit("load", "x");
		await vi.advanceTimersByTimeAsync(10);
		tasks[0]?.abort("bye");
		await vi.advanceTimersByTimeAsync(20_000);

		expect(signals).toHaveLength(4);
		expect(signals.every((s) => s.aborted)).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		const started = recorder.events.filter((e) => e.phase === "start");
		const ended = recorder.events.filter((e) => e.phase !== "start");
		expect(ended.length).toBe(started.length);
		expect(
			recorder.events.filter((e) => e.phase === "done" || e.phase === "error"),
		).toHaveLength(0);
	});

	it("emits from an aborted task are dropped (saga: put after cancel)", async () => {
		const { bus } = setup();
		const logs: string[] = [];
		bus.on("log", (m) => logs.push(m));
		const tasks: Context<Events>[] = [];
		bus.on("load", async (_, ctx) => {
			tasks.push(ctx);
			ctx.emit("log", "before");
			await delay(100, ctx).catch(() => {});
			ctx.emit("log", "after");
		});

		bus.emit("load", "x");
		tasks[0]?.abort();
		await vi.advanceTimersByTimeAsync(200);

		expect(logs).toEqual(["before"]);
	});

	it("aborting a task after it finished changes nothing", async () => {
		const { bus, recorder } = setup();
		const tasks: Context<Events>[] = [];
		bus.on(
			"load",
			latest(async (_, ctx) => {
				tasks.push(ctx);
			}),
		);
		bus.emit("load", "x");
		await vi.advanceTimersByTimeAsync(0);
		const before = recorder.events.length;
		tasks[0]?.abort();

		expect(recorder.events).toHaveLength(before);
	});

	it("latest per key: one instance per key keeps keys independent", async () => {
		const { bus } = setup();
		const finished: string[] = [];
		const perKey = new Map<string, Task<string, Events, unknown>>();
		bus.on("load", (key, ctx) => {
			let handler = perKey.get(key);
			if (!handler) {
				handler = latest<string, Events, Promise<void>>(async (k, c) => {
					await delay(100, c);
					finished.push(k);
				});
				perKey.set(key, handler);
			}
			handler(key, ctx);
		});

		bus.emit("load", "a");
		bus.emit("load", "b");
		bus.emit("load", "a");
		await vi.advanceTimersByTimeAsync(100);

		expect(finished.sort()).toEqual(["a", "b"]);
	});
});
