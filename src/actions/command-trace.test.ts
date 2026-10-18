import { describe, expect, it } from "vitest";
import { createApp, deferred } from "../tests/test-helpers";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { createAction } from "./action";
import { createCommand } from "./command";
import { createJob } from "./job";
import { createModule } from "./module";

type Events = { ping: number; loaded: string };

const setup = (sample?: Parameters<typeof createTracer>[1]) => {
	const recorder = createTraceRecorder<Events>();
	const app = createApp<Events>({ trace: createTracer(recorder, sample) });
	const starts = () =>
		recorder.events.filter((event) => event.phase === "start");
	const startOf = (type: string) =>
		recorder.events.find(
			(event) => event.type === type && event.phase === "start",
		);
	return { app, recorder, starts, startOf };
};

describe("tracing of commands", () => {
	describe("identity", () => {
		it("reports the type, the effect and the payload", () => {
			const { app, startOf } = setup();
			app.bus.emit(
				createCommand("math/double", (value: number) => value * 2),
				4,
			);

			expect(startOf("math/double")).toMatchObject({
				type: "math/double",
				effect: "command",
				phase: "start",
				payload: 4,
			});
		});

		it("reports done, error and cancel", async () => {
			const { app, recorder } = setup();
			const ok = createCommand("ok", (value: number) => value);
			const bad = createCommand("bad", (_: number) => {
				throw new Error("boom");
			});
			const stop = createCommand("stop", (_: number, ctx) => {
				const pending = deferred();
				ctx.abort();
				return pending.promise;
			});
			app.bus.emit(ok, 1);
			try {
				app.bus.emit(bad, 1);
			} catch {}
			app.bus.emit(stop, 1);

			expect(
				recorder.events.map((event) => `${event.type}/${event.phase}`),
			).toEqual([
				"ok/start",
				"ok/done",
				"bad/start",
				"bad/error",
				"stop/start",
				"stop/cancel",
			]);
		});

		it("reports a command with no handler as an error", () => {
			const { app, recorder } = setup();
			const command = createCommand<number, number>("a/b");
			try {
				app.bus.emit(command, 1);
			} catch {}
			const last = recorder.events.at(-1);

			expect(last?.phase).toBe("error");
			expect(last?.error).toBeInstanceOf(Error);
		});

		it("reports a bound handler like the default one", () => {
			const { app, startOf } = setup();
			const command = createCommand<number, number>("a/b");
			app.commands.handle(command, (value) => value);
			app.bus.emit(command, 1);

			expect(startOf("a/b")?.effect).toBe("command");
		});

		it("gives every run its own id", () => {
			const { app, starts } = setup();
			const command = createCommand("a/b", (value: number) => value);
			app.bus.emit(command, 1);
			app.bus.emit(command, 2);
			const ids = starts().map((event) => event.id);

			expect(new Set(ids).size).toBe(2);
		});

		it("reports a job as a command run", async () => {
			const { app, recorder } = setup();
			const job = createJob("user/load", async () => "x", { done: "loaded" });
			await app.bus.emit(job, void 0);

			expect(
				recorder.events.map((event) => `${event.effect}/${event.phase}`),
			).toEqual(["command/start", "command/done"]);
		});
	});

	describe("causality", () => {
		it("a command emitted with ctx.emit is a child of the command that emitted it", () => {
			const { app, startOf } = setup();
			const inner = createCommand("inner", (value: number) => value + 1);
			const outer = createCommand("outer", (value: number, ctx) =>
				ctx.emit(inner, value),
			);
			app.bus.emit(outer, 1);

			expect(startOf("inner")?.parent).toBe(startOf("outer")?.id);
		});

		it("a root command has no parent", () => {
			const { app, startOf } = setup();
			app.bus.emit(
				createCommand("outer", (value: number) => value),
				1,
			);

			expect(startOf("outer")).not.toHaveProperty("parent");
		});

		it("links a chain of three", () => {
			const { app, startOf } = setup();
			const ctx2 = createCommand("c", (value: number) => value);
			const second = createCommand("b", (value: number, ctx) =>
				ctx.emit(ctx2, value),
			);
			const first = createCommand("a", (value: number, ctx) =>
				ctx.emit(second, value),
			);
			app.bus.emit(first, 1);

			expect(startOf("c")?.parent).toBe(startOf("b")?.id);
			expect(startOf("b")?.parent).toBe(startOf("a")?.id);
		});

		it("a command emitted with a plain bus.emit is not linked", () => {
			const { app, startOf } = setup();
			const inner = createCommand("inner", (value: number) => value);
			const outer = createCommand("outer", (value: number) =>
				app.bus.emit(inner, value),
			);
			app.bus.emit(outer, 1);

			expect(startOf("inner")).not.toHaveProperty("parent");
		});

		it("the link is gone once ctx.emit has returned", () => {
			const { app, startOf } = setup();
			const inner = createCommand("inner", (value: number) => value);
			const noise = createCommand("noise", (_: number, ctx) => {
				ctx.emit("ping", 0);
			});
			app.bus.emit(noise, 1);
			app.bus.emit(inner, 1);

			expect(startOf("inner")).not.toHaveProperty("parent");
		});

		it("the link is restored even when the emitted handler throws", () => {
			const { app, startOf } = setup();
			const inner = createCommand("inner", (value: number) => value);
			const boom = createCommand("boom", (_: number) => {
				throw new Error("boom");
			});
			const outer = createCommand("outer", (value: number, ctx) => {
				try {
					ctx.emit(boom, value);
				} catch {}
			});
			app.bus.emit(outer, 1);
			app.bus.emit(inner, 1);

			expect(startOf("inner")).not.toHaveProperty("parent");
		});

		it("nested links do not leak into a sibling emitted afterwards", () => {
			const { app, startOf } = setup();
			const first = createCommand("a", (value: number) => value);
			const second = createCommand("b", (value: number) => value);
			const outer = createCommand("outer", (value: number, ctx) => {
				ctx.emit(first, value);
				ctx.emit(second, value);
			});
			app.bus.emit(outer, 1);

			expect(startOf("a")?.parent).toBe(startOf("outer")?.id);
			expect(startOf("b")?.parent).toBe(startOf("outer")?.id);
		});

		it("a command emitted after the task was aborted is not run", () => {
			const { app, starts } = setup();
			const inner = createCommand("inner", (value: number) => value);
			const outer = createCommand("outer", (value: number, ctx) => {
				ctx.abort();
				ctx.emit(inner, value);
			});
			app.bus.emit(outer, 1);

			expect(starts().map((event) => event.type)).toEqual(["outer"]);
		});
	});

	describe("jobs", () => {
		it("a command used as the result outlet is a child of the job", async () => {
			const { app, startOf } = setup();
			const show = createCommand("ui/show", (text: string) => text.length);
			const job = createJob("user/load", async () => "hello", { done: show });
			await app.bus.emit(job, void 0);

			expect(startOf("ui/show")?.parent).toBe(startOf("user/load")?.id);
		});

		it("a command used as the error outlet is a child of the job", async () => {
			const { app, startOf } = setup();
			const report = createCommand("ui/report", (_: Error) => {});
			const job = createJob(
				"user/load",
				async () => {
					throw new Error("boom");
				},
				{ fail: report },
			);
			await app.bus.emit(job, void 0);

			expect(startOf("ui/report")?.parent).toBe(startOf("user/load")?.id);
		});

		it("an action creator used as an outlet does not add a task", async () => {
			const { app, starts } = setup();
			const loaded = createAction<string, "loaded">("loaded");
			const job = createJob("user/load", async () => "x", { done: loaded });
			await app.bus.emit(job, void 0);

			expect(starts().map((event) => event.type)).toEqual(["user/load"]);
		});

		it("the job ends after its outlet command has run", async () => {
			const { app, recorder } = setup();
			const show = createCommand("ui/show", (text: string) => text.length);
			const job = createJob("user/load", async () => "hi", { done: show });
			await app.bus.emit(job, void 0);

			expect(
				recorder.events.map((event) => `${event.type}/${event.phase}`),
			).toEqual([
				"user/load/start",
				"ui/show/start",
				"ui/show/done",
				"user/load/done",
			]);
		});
	});

	describe("sampling follows the root", () => {
		it("traces the whole chain of a sampled root", () => {
			const { app, starts } = setup({ sample: 1 });
			const inner = createCommand("inner", (value: number) => value);
			const outer = createCommand("outer", (value: number, ctx) =>
				ctx.emit(inner, value),
			);
			app.bus.emit(outer, 1);

			expect(starts().map((event) => event.type)).toEqual(["outer", "inner"]);
		});

		it("traces nothing of a root that is not sampled, including what it emits", () => {
			const { app, recorder } = setup({ sample: 0 });
			const inner = createCommand("inner", (value: number) => value);
			const outer = createCommand("outer", (value: number, ctx) =>
				ctx.emit(inner, value),
			);
			app.bus.emit(outer, 1);

			expect(recorder.events).toEqual([]);
		});

		it("decides per root: only the chosen roots are traced, with their children", () => {
			const { app, starts } = setup({ sample: ({ type }) => type === "keep" });
			const child = createCommand("child", (value: number) => value);
			const keep = createCommand("keep", (value: number, ctx) =>
				ctx.emit(child, value),
			);
			const skip = createCommand("skip", (value: number, ctx) =>
				ctx.emit(child, value),
			);
			app.bus.emit(skip, 1);
			app.bus.emit(keep, 1);

			expect(starts().map((event) => event.type)).toEqual(["keep", "child"]);
		});
	});

	describe("modules", () => {
		it("a command emitted by a module has a parent", () => {
			const { app, startOf } = setup();
			const command = createCommand("a/b", (value: number) => value);
			app.mount(
				createModule<Events>("m", (moduleContext) =>
					moduleContext.emit(command, 1),
				),
			);

			expect(startOf("a/b")?.parent).toBeTypeOf("number");
		});
	});
});
