import { afterEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../bus";
import type { TestEvents } from "../test-helpers";
import { deferred } from "../test-helpers";
import { createTraceRecorder } from "./recorder";
import { createTracer } from "./tracer";

const setup = () => {
	const recorder = createTraceRecorder();
	return { recorder, tracer: createTracer(recorder) };
};

describe("createTracer", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("task and report", () => {
		it("numbers tasks from 1", () => {
			const { recorder, tracer } = setup();
			const a = tracer.task({ type: "a" });
			const b = tracer.task({ type: "b" });
			tracer.report(a, "run", "start");
			tracer.report(b, "run", "start");

			expect(recorder.events.map((e) => e.id)).toEqual([1, 2]);
		});

		it("builds the event from the task and the call", () => {
			const { recorder, tracer } = setup();
			const ref = tracer.task({ type: "search", payload: "q" });
			tracer.report(ref, "latest", "start");

			expect(recorder.events[0]).toEqual({
				id: 1,
				type: "search",
				effect: "latest",
				phase: "start",
				payload: "q",
			});
		});

		it("has no parent key for a root task", () => {
			const { recorder, tracer } = setup();
			tracer.report(tracer.task({ type: "a" }), "run", "start");

			expect(recorder.events[0]).not.toHaveProperty("parent");
		});

		it("links a child to its parent", () => {
			const { recorder, tracer } = setup();
			const parent = tracer.task({ type: "a" });
			const child = tracer.task({ type: "a" }, parent);
			tracer.report(child, "run", "start");

			expect(recorder.events[0]?.parent).toBe(1);
		});

		it("sets error only for the error phase", () => {
			const { recorder, tracer } = setup();
			const ref = tracer.task({ type: "a" });
			const cause = new Error("boom");
			tracer.report(ref, "run", "done", cause);
			tracer.report(ref, "run", "error", cause);

			expect(recorder.events[0]).not.toHaveProperty("error");
			expect(recorder.events[1]?.error).toBe(cause);
		});

		it("keeps separate tracers independent", () => {
			const a = setup();
			const b = setup();
			a.tracer.report(a.tracer.task({ type: "x" }), "run", "start");
			b.tracer.report(b.tracer.task({ type: "x" }), "run", "start");

			expect(a.recorder.events[0]?.id).toBe(1);
			expect(b.recorder.events[0]?.id).toBe(1);
		});

		it("keeps ids unique when one tracer serves two buses", async () => {
			const { recorder, tracer } = setup();
			const first = createBus<TestEvents>({ trace: tracer });
			const second = createBus<TestEvents>({ trace: tracer });
			for (const bus of [first, second]) {
				bus.on("t", (_, ctx) => ctx.run(() => 1));
				bus.emit("t", 1);
			}
			await Promise.resolve();
			const ids = recorder.events
				.filter((e) => e.phase === "start")
				.map((e) => e.id);

			expect(new Set(ids).size).toBe(ids.length);
		});
	});

	describe("loggers", () => {
		it("works with no loggers", () => {
			const tracer = createTracer([]);

			expect(() =>
				tracer.report(tracer.task({ type: "a" }), "run", "start"),
			).not.toThrow();
		});

		it("gives every logger every event", () => {
			const a = vi.fn();
			const b = vi.fn();
			const tracer = createTracer([a, b]);
			tracer.report(tracer.task({ type: "x" }), "run", "start");

			expect(a).toHaveBeenCalledTimes(1);
			expect(b).toHaveBeenCalledTimes(1);
		});

		it("isolates a logger that throws", () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			const after = vi.fn();
			const tracer = createTracer([
				() => {
					throw new Error("bad logger");
				},
				after,
			]);
			tracer.report(tracer.task({ type: "x" }), "run", "start");

			expect(after).toHaveBeenCalledTimes(1);
		});
	});

	describe("settler", () => {
		it("reports only the first phase", () => {
			const { recorder, tracer } = setup();
			const settle = tracer.settler(tracer.task({ type: "a" }), "latest");
			settle("cancel");
			settle("done");
			settle("error", new Error("late"));

			expect(recorder.events.map((e) => e.phase)).toEqual(["cancel"]);
		});

		it("keeps settlers of different tasks apart", () => {
			const { recorder, tracer } = setup();
			const a = tracer.settler(tracer.task({ type: "a" }), "latest");
			const b = tracer.settler(tracer.task({ type: "b" }), "latest");
			a("done");
			b("done");

			expect(recorder.events.map((e) => e.type)).toEqual(["a", "b"]);
		});
	});

	describe("run", () => {
		const phases = (recorder: ReturnType<typeof setup>["recorder"]) =>
			recorder.events.map((e) => e.phase);

		it("returns a sync result and reports start, done", () => {
			const { recorder, tracer } = setup();
			const ref = tracer.task({ type: "a" });
			const result = tracer.run(
				ref,
				"run",
				new AbortController().signal,
				() => 5,
			);

			expect(result).toBe(5);
			expect(phases(recorder)).toEqual(["start", "done"]);
		});

		it("reports and rethrows a sync error", () => {
			const { recorder, tracer } = setup();
			const ref = tracer.task({ type: "a" });
			const run = () =>
				tracer.run(ref, "run", new AbortController().signal, () => {
					throw new Error("boom");
				});

			expect(run).toThrow("boom");
			expect(phases(recorder)).toEqual(["start", "error"]);
		});

		it("returns a promise and reports done when it resolves", async () => {
			const { recorder, tracer } = setup();
			const ref = tracer.task({ type: "a" });
			const d = deferred<number>();
			const promise = tracer.run(
				ref,
				"run",
				new AbortController().signal,
				() => d.promise,
			);
			expect(phases(recorder)).toEqual(["start"]);
			d.resolve(7);

			await expect(promise).resolves.toBe(7);
			expect(phases(recorder)).toEqual(["start", "done"]);
		});

		it("reports error and rejects when the promise rejects", async () => {
			const { recorder, tracer } = setup();
			const ref = tracer.task({ type: "a" });
			const promise = tracer.run(ref, "run", new AbortController().signal, () =>
				Promise.reject(new Error("boom")),
			);

			await expect(promise).rejects.toThrow("boom");
			expect(phases(recorder)).toEqual(["start", "error"]);
		});

		it("reports cancel at once when the signal aborts, and nothing after", async () => {
			const { recorder, tracer } = setup();
			const ref = tracer.task({ type: "a" });
			const controller = new AbortController();
			const d = deferred<number>();
			const promise = tracer.run(
				ref,
				"run",
				controller.signal,
				() => d.promise,
			);
			controller.abort();
			expect(phases(recorder)).toEqual(["start", "cancel"]);
			d.resolve(1);
			await promise;

			expect(phases(recorder)).toEqual(["start", "cancel"]);
		});

		it("reports start then cancel if the signal is already aborted", () => {
			const { recorder, tracer } = setup();
			const ref = tracer.task({ type: "a" });
			const controller = new AbortController();
			controller.abort();
			tracer.run(ref, "run", controller.signal, () => 1);

			expect(phases(recorder)).toEqual(["start", "cancel"]);
		});

		it("an abort after the run finished adds nothing", () => {
			const { recorder, tracer } = setup();
			const ref = tracer.task({ type: "a" });
			const controller = new AbortController();
			tracer.run(ref, "run", controller.signal, () => 1);
			controller.abort();

			expect(phases(recorder)).toEqual(["start", "done"]);
		});
	});

	describe("filter", () => {
		it("logs only the events it accepts", () => {
			const recorder = createTraceRecorder();
			const tracer = createTracer(recorder, {
				filter: (event) => event.phase === "error",
			});
			const ref = tracer.task({ type: "a" });
			tracer.report(ref, "run", "start");
			tracer.report(ref, "run", "done");
			tracer.report(ref, "run", "error", new Error("boom"));

			expect(recorder.events.map((e) => e.phase)).toEqual(["error"]);
		});

		it("gets the full event", () => {
			const filter = vi.fn(() => true);
			const tracer = createTracer(() => {}, { filter });
			tracer.report(tracer.task({ type: "a", payload: 1 }), "run", "start");

			expect(filter).toHaveBeenCalledWith({
				id: 1,
				type: "a",
				effect: "run",
				phase: "start",
				payload: 1,
			});
		});

		it("applies to events from run and settler too", async () => {
			const recorder = createTraceRecorder();
			const tracer = createTracer(recorder, {
				filter: (event) => event.phase === "done",
			});
			const ref = tracer.task({ type: "a" });
			tracer.run(ref, "run", new AbortController().signal, () => 1);

			expect(recorder.events.map((e) => e.phase)).toEqual(["done"]);
		});
	});

	describe("sample", () => {
		const root = (tracer: ReturnType<typeof createTracer>) =>
			tracer.task({ type: "root" });

		it("traces everything by default", () => {
			const { recorder, tracer } = setup();
			tracer.report(root(tracer), "run", "start");

			expect(recorder.events).toHaveLength(1);
		});

		it("traces nothing with 0", () => {
			const recorder = createTraceRecorder();
			const tracer = createTracer(recorder, { sample: 0 });
			const ref = root(tracer);
			tracer.report(ref, "run", "start");
			tracer.settler(ref, "run")("done");

			expect(recorder.events).toHaveLength(0);
		});

		it("traces everything with 1", () => {
			const recorder = createTraceRecorder();
			const tracer = createTracer(recorder, { sample: 1 });
			for (let i = 0; i < 20; i++) {
				tracer.report(root(tracer), "run", "start");
			}

			expect(recorder.events).toHaveLength(20);
		});

		it("compares a random number with the share", () => {
			const recorder = createTraceRecorder();
			const tracer = createTracer(recorder, { sample: 0.5 });
			const random = vi.spyOn(Math, "random");
			random.mockReturnValueOnce(0.3).mockReturnValueOnce(0.7);
			tracer.report(root(tracer), "run", "start");
			tracer.report(root(tracer), "run", "start");

			expect(recorder.events.map((e) => e.id)).toEqual([1]);
			random.mockRestore();
		});

		it("accepts a function of the root event", () => {
			const recorder = createTraceRecorder();
			const sample = vi.fn(({ type }: { type: string }) => type === "keep");
			const tracer = createTracer(recorder, { sample });
			tracer.report(tracer.task({ type: "drop", payload: 1 }), "run", "start");
			tracer.report(tracer.task({ type: "keep", payload: 2 }), "run", "start");

			expect(recorder.events.map((e) => e.type)).toEqual(["keep"]);
			expect(sample).toHaveBeenCalledWith({ type: "keep", payload: 2 });
		});

		it("decides once per root task and not for children", () => {
			const sample = vi.fn(() => true);
			const tracer = createTracer(() => {}, { sample });
			const parent = root(tracer);
			tracer.task({ type: "child" }, parent);
			tracer.task({ type: "child" }, parent);

			expect(sample).toHaveBeenCalledTimes(1);
		});

		it("children follow an unsampled root", () => {
			const recorder = createTraceRecorder();
			const tracer = createTracer(recorder, { sample: () => false });
			const child = tracer.task({ type: "child" }, root(tracer));
			tracer.report(child, "run", "start");

			expect(recorder.events).toHaveLength(0);
		});

		it("children follow a sampled root, even through several levels", () => {
			const recorder = createTraceRecorder();
			const tracer = createTracer(recorder, { sample: () => true });
			const child = tracer.task({ type: "child" }, root(tracer));
			const leaf = tracer.task({ type: "leaf" }, child);
			tracer.report(leaf, "run", "start");

			expect(recorder.events.map((e) => e.type)).toEqual(["leaf"]);
		});

		it("an unsampled run just returns what fn returns", async () => {
			const recorder = createTraceRecorder();
			const tracer = createTracer(recorder, { sample: 0 });
			const ref = root(tracer);
			const promise = Promise.resolve(5);
			const result = tracer.run(
				ref,
				"run",
				new AbortController().signal,
				() => promise,
			);

			expect(result).toBe(promise);
			expect(recorder.events).toHaveLength(0);
		});

		it("an unsampled run still rethrows errors", () => {
			const tracer = createTracer(() => {}, { sample: 0 });
			const ref = root(tracer);

			expect(() =>
				tracer.run(ref, "run", new AbortController().signal, () => {
					throw new Error("boom");
				}),
			).toThrow("boom");
		});

		it("combines with a filter", () => {
			const recorder = createTraceRecorder();
			const tracer = createTracer(recorder, {
				sample: () => true,
				filter: (event) => event.phase !== "start",
			});
			const ref = root(tracer);
			tracer.report(ref, "run", "start");
			tracer.report(ref, "run", "done");

			expect(recorder.events.map((e) => e.phase)).toEqual(["done"]);
		});

		it("traces a whole handler tree or none of it on a bus", async () => {
			const recorder = createTraceRecorder<TestEvents>();
			const bus = createBus<TestEvents>({
				trace: createTracer(recorder, {
					sample: ({ payload }) => payload === 1,
				}),
			});
			bus.on("t", (_, ctx) =>
				ctx.run((_: number, child) => child.run(() => 1), 1),
			);
			bus.emit("t", 1);
			bus.emit("t", 2);
			await new Promise((r) => setTimeout(r, 0));

			expect(recorder.events.filter((e) => e.phase === "start")).toHaveLength(
				2,
			);
			expect(recorder.events.filter((e) => e.phase === "done")).toHaveLength(2);
		});
	});
});
