import { describe, expect, it, vi } from "vitest";
import { createAction, createCommand, createJob } from "../actions";
import { createBus } from "../core/bus";
import { scopePlugin } from "../scope";
import { noPayload } from "../tests/test-helpers";
import { consoleLogger } from "./console";
import { emitFrom } from "./origin";
import { tracePlugin } from "./plugin";
import { createTraceRecorder } from "./recorder";
import { createTracer } from "./tracer";

const setup = () => {
	const recorder = createTraceRecorder();
	const bus = createBus({ trace: createTracer(recorder) }).use(tracePlugin());
	// the groups of the events of one task type, in order; the emit event has its own tests
	const groupsOf = (type: string) =>
		recorder.events
			.filter((event) => event.type === type && event.effect !== "emit")
			.map((event) => event.traceGroupId);

	return { bus, recorder, groupsOf };
};

describe("traceGroupId", () => {
	it("is declared in the scope of a command", async () => {
		const { bus, groupsOf } = setup();
		const pay = createCommand("checkout/pay", async (_: undefined) => 1, {
			traceGroupId: "checkout",
		});

		await bus.emit(pay(noPayload));

		expect(groupsOf("checkout/pay")).toEqual(["checkout", "checkout"]);
	});

	it("is declared in the scope of a job", async () => {
		const { bus, groupsOf } = setup();
		const load = createJob(
			"user/load",
			async (_: undefined) => 1,
			{},
			{ traceGroupId: "user" },
		);

		await bus.emit(load(noPayload));

		expect(groupsOf("user/load")).toEqual(["user", "user"]);
	});

	it("is declared in the scope of an action, and its listeners pass it on", async () => {
		const { bus, groupsOf } = setup();
		const saved = createAction("user/saved", { traceGroupId: "save" });
		const notify = createCommand("notify", async (_: undefined) => 1);
		bus.on(saved, async (_payload, ctx) => {
			await ctx.emit(notify(noPayload));
		});

		bus.emit(saved(noPayload));
		await Promise.resolve();

		expect(groupsOf("notify")).toEqual(["save", "save"]);
	});

	it("is inherited by the tasks that a task starts with ctx.emit", async () => {
		const { bus, groupsOf } = setup();
		const inner = createCommand("inner", async (_: undefined) => 1);
		const outer = createCommand(
			"outer",
			async (_: undefined, ctx) => {
				await ctx.emit(inner(noPayload));
			},
			{ traceGroupId: "flow" },
		);
		bus.commands = {
			run: (command, payload, ctx) =>
				Reflect.apply(command, null, [payload, ctx]),
		};

		await bus.emit(outer(noPayload));

		expect(groupsOf("inner")).toEqual(["flow", "flow"]);
	});

	it("is inherited through ctx.run", async () => {
		const { bus, groupsOf } = setup();
		const outer = createCommand(
			"outer",
			async (_: undefined, ctx) => {
				await ctx.run(async (_value: number, child) => {
					const deep = createCommand("deep", async (_: undefined) => 1);
					await child.emit(deep(noPayload));
				}, 1);
			},
			{ traceGroupId: "flow" },
		);

		await bus.emit(outer(noPayload));

		expect(groupsOf("deep")).toEqual(["flow", "flow"]);
	});

	it("has the nearer group win, and leaves the group above as it was", async () => {
		const { bus, groupsOf } = setup();
		const payment = createCommand("payment", async (_: undefined) => 1, {
			traceGroupId: "payment",
		});
		const checkout = createCommand(
			"checkout",
			async (_: undefined, ctx) => {
				await ctx.emit(payment(noPayload));
			},
			{ traceGroupId: "checkout" },
		);

		await bus.emit(checkout(noPayload));

		expect(groupsOf("payment")).toEqual(["payment", "payment"]);
		expect(groupsOf("checkout")).toEqual(["checkout", "checkout"]);
	});

	it("is shared by two roots that declare the same group", async () => {
		const { bus, recorder } = setup();
		const first = createCommand("first", async (_: undefined) => 1, {
			traceGroupId: "flow",
		});
		const second = createCommand("second", async (_: undefined) => 1, {
			traceGroupId: "flow",
		});

		await bus.emit(first(noPayload));
		await bus.emit(second(noPayload));

		const groups = new Set(recorder.events.map((event) => event.traceGroupId));
		expect([...groups]).toEqual(["flow"]);
	});

	it("is absent from the events when no task has a group", async () => {
		const { bus, recorder } = setup();
		const plain = createCommand("plain", async (_: undefined) => 1);

		await bus.emit(plain(noPayload));

		expect(recorder.events.length).toBeGreaterThan(0);
		for (const event of recorder.events) {
			expect("traceGroupId" in event).toBe(false);
		}
	});

	it("is not a field of the context", async () => {
		const { bus } = setup();
		let seen: unknown = "unset";
		const pay = createCommand(
			"checkout/pay",
			async (_: undefined, ctx) => {
				seen = Reflect.get(ctx, "traceGroupId");
			},
			{ traceGroupId: "checkout" },
		);

		await bus.emit(pay(noPayload));

		expect(seen).toBeUndefined();
	});
});

describe("consoleLogger with a group", () => {
	it("prints the group after the prefix, and nothing for a task without one", () => {
		const out = { debug: vi.fn(), error: vi.fn() };
		const log = consoleLogger({ console: out });

		log({
			id: 1,
			type: "checkout/pay",
			effect: "command",
			phase: "start",
			payload: 1,
			traceGroupId: "checkout",
		});
		log({
			id: 2,
			type: "plain",
			effect: "command",
			phase: "start",
			payload: 2,
		});

		expect(out.debug.mock.calls[0]?.[0]).toBe(
			"[nanoeffects] [checkout] checkout/pay · command start",
		);
		expect(out.debug.mock.calls[1]?.[0]).toBe(
			"[nanoeffects] plain · command start",
		);
	});
});

describe("traceGroupId in a scope", () => {
	it("works without scopePlugin and is not put on the context with it", async () => {
		const recorder = createTraceRecorder();
		const bus = createBus({ trace: createTracer(recorder) })
			.use(tracePlugin())
			.use(scopePlugin());
		let seen: unknown = "unset";
		let cache: unknown;
		const pay = createCommand(
			"checkout/pay",
			async (_: undefined, ctx) => {
				seen = Reflect.get(ctx, "traceGroupId");
				cache = Reflect.get(ctx, "cache");
			},
			{ traceGroupId: "checkout", cache: "kept" },
		);

		await bus.emit(pay(noPayload));

		expect(seen).toBeUndefined();
		expect(cache).toBe("kept");
		expect(
			recorder.events.every((event) => event.traceGroupId === "checkout"),
		).toBe(true);
	});

	it("takes a scope for a command whose handler is bound later", () => {
		const later = createCommand<
			undefined,
			number,
			"later",
			{ traceGroupId: string }
		>("later", void 0, { traceGroupId: "flow" });

		expect(later.type).toBe("later");
	});
});

describe("rootId", () => {
	it("links a command below a listener to the root, though its parentId is the listener", async () => {
		const recorder = createTraceRecorder();
		const bus = createBus({ trace: createTracer(recorder) }).use(tracePlugin());
		const save = createCommand("user/save", async (_: undefined) => 1);
		bus.on("name/changed", async (_name, ctx) => {
			await ctx.emit(save(noPayload));
		});

		emitFrom(
			bus,
			{ type: "name/changed", payload: "Eva" },
			{ traceId: "Profile" },
		);
		await Promise.resolve();

		const root = recorder.events.find((event) => event.type === "Profile");
		const command = recorder.events.find((event) => event.type === "user/save");
		expect(root?.rootId).toBeUndefined();
		expect(command?.rootId).toBe(root?.id);
		expect(command?.parentId).not.toBe(root?.id);
	});

	it("is the same for tasks of a policy and its runs", async () => {
		const recorder = createTraceRecorder();
		const bus = createBus({ trace: createTracer(recorder) }).use(tracePlugin());
		const load = createCommand("load", async (_: undefined, ctx) => {
			await ctx.run(async () => 1);
		});

		await bus.emit(load(noPayload));

		const command = recorder.events.find(
			(event) => event.type === "load" && event.effect === "command",
		);
		const run = recorder.events.find((event) => event.effect === "run");
		expect(command?.rootId).toBeUndefined();
		expect(run?.rootId).toBe(command?.id);
	});

	it("is absent from the events of every root task", async () => {
		const recorder = createTraceRecorder();
		const bus = createBus({ trace: createTracer(recorder) }).use(tracePlugin());
		const plain = createCommand("plain", async (_: undefined) => 1);

		await bus.emit(plain(noPayload));

		expect(recorder.events.every((event) => event.rootId === void 0)).toBe(
			true,
		);
	});
});
