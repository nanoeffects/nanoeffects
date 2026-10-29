import { describe, expect, it, vi } from "vitest";
import { createCommand } from "../actions";
import { createBus } from "../core/bus";
import { noPayload } from "../tests/test-helpers";
import { tracePlugin } from "./plugin";
import { createTraceRecorder } from "./recorder";
import { createTracer } from "./tracer";

type Events = { "name/changed": string; other: number };

// lets the promises of the handlers settle
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = () => {
	const recorder = createTraceRecorder();
	const bus = createBus<Events>({ trace: createTracer(recorder) });
	bus.use(tracePlugin());

	return { bus, recorder };
};

describe("tracePlugin", () => {
	it("returns the same bus, with or without a tracer", () => {
		const traced = createBus<Events>({
			trace: createTracer(createTraceRecorder()),
		});
		const plain = createBus<Events>();

		expect(traced.use(tracePlugin())).toBe(traced);
		expect(plain.use(tracePlugin())).toBe(plain);
	});

	it("changes nothing on a bus without a tracer", () => {
		const bus = createBus<Events>();
		const { emit, on, once, off } = bus;
		bus.use(tracePlugin());

		expect([bus.emit, bus.on, bus.once, bus.off]).toEqual([
			emit,
			on,
			once,
			off,
		]);
	});

	describe("the call that is being emitted", () => {
		it("gives a nested call its own group and puts the outer one back", async () => {
			const { bus, recorder } = setup();
			const payment = createCommand("payment", async (_: undefined) => 1, {
				traceGroupId: "payment",
			});
			const plain = createCommand("plain", async (_: undefined) => 1);
			const checkout = createCommand(
				"checkout",
				async (_: undefined, ctx) => {
					await ctx.emit(payment(noPayload));
					await ctx.emit(plain(noPayload));
				},
				{ traceGroupId: "checkout" },
			);

			await bus.emit(checkout(noPayload));

			const groupOf = (type: string) =>
				recorder.events.find((event) => event.type === type)?.traceGroupId;
			expect(groupOf("payment")).toBe("payment");
			expect(groupOf("plain")).toBe("checkout");
		});

		it("lets the error of a handler reach the caller, and forgets the call", () => {
			const { bus, recorder } = setup();
			bus.on("name/changed", () => {
				throw new Error("boom");
			});
			const grouped = createCommand("grouped", async (_: undefined) => 1, {
				traceGroupId: "flow",
			});

			expect(() => bus.emit("name/changed", "Eva")).toThrow("boom");
			bus.commands = {
				run: (command, payload, ctx) =>
					Reflect.apply(command, null, [payload, ctx]),
			};
			bus.emit(createCommand("later", async (_: undefined) => 1)(noPayload));
			void grouped;

			const later = recorder.events.find((event) => event.type === "later");
			expect(later?.traceGroupId).toBeUndefined();
		});
	});

	describe("a named listener", () => {
		it("is a task named by its traceId, and a command it emits is below it", async () => {
			const { bus, recorder } = setup();
			const save = createCommand("user/save", async (_: undefined) => 1);
			bus.on(
				"name/changed",
				async (_name, ctx) => {
					await ctx.emit(save(noPayload));
				},
				{ traceId: "saveNotifier" },
			);
			bus.on("name/changed", () => {}, { traceId: "auditLog" });

			bus.emit("name/changed", "Eva");
			await settle();

			const named = recorder.events.filter((event) => event.effect === "run");
			expect(named.map((event) => event.type).sort()).toEqual([
				"auditLog",
				"auditLog",
				"saveNotifier",
				"saveNotifier",
			]);
			const notifier = recorder.events.find(
				(event) => event.type === "saveNotifier",
			);
			const command = recorder.events.find(
				(event) => event.type === "user/save",
			);
			expect(command?.parentId).toBe(notifier?.id);
		});

		it("gives the handler the payload and the same context", () => {
			const { bus } = setup();
			const seen: unknown[] = [];
			bus.on(
				"name/changed",
				(payload, ctx) => {
					seen.push(payload, typeof ctx.emit, ctx.type);
				},
				{ traceId: "x" },
			);

			bus.emit("name/changed", "Eva");

			expect(seen).toEqual(["Eva", "function", "name/changed"]);
		});

		it("is removed by off with the handler, and by off of the event", () => {
			const { bus } = setup();
			const handler = vi.fn();
			const other = vi.fn();
			bus.on("name/changed", handler, { traceId: "a" });
			bus.on("other", other, { traceId: "b" });

			bus.off("name/changed", handler);
			bus.emit("name/changed", "Eva");
			expect(handler).not.toHaveBeenCalled();

			bus.off("other");
			bus.emit("other", 1);
			expect(other).not.toHaveBeenCalled();
		});

		it("runs once with once, and is reported once", () => {
			const { bus, recorder } = setup();
			const handler = vi.fn();
			bus.once("name/changed", handler, { traceId: "once" });

			bus.emit("name/changed", "a");
			bus.emit("name/changed", "b");

			expect(handler).toHaveBeenCalledTimes(1);
			expect(
				recorder.events.filter(
					(event) => event.type === "once" && event.phase === "start",
				),
			).toHaveLength(1);
		});

		it("leaves a handler without a traceId as it is, also for off", () => {
			const { bus } = setup();
			const handler = vi.fn();
			bus.on("name/changed", handler);

			bus.off("name/changed", handler);
			bus.emit("name/changed", "Eva");

			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("with the option off", () => {
		it("runs a handler with an option on a bus without the plugin, with the same result", async () => {
			const bus = createBus<Events>({
				trace: createTracer(createTraceRecorder()),
			});
			const handler = vi.fn(async (name: string) => name);
			bus.on("name/changed", handler, { traceId: "x" });

			bus.emit("name/changed", "Eva");

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler.mock.calls[0]?.[0]).toBe("Eva");
		});

		it("hands the same error to onError as an unnamed listener", async () => {
			const seen: unknown[][] = [];
			for (const options of [void 0, { traceId: "x" }]) {
				const onError = vi.fn();
				const bus = createBus<Events>({
					trace: createTracer(createTraceRecorder()),
					onError,
				});
				bus.use(tracePlugin());
				const failure = new Error("boom");
				bus.on("name/changed", () => Promise.reject(failure), options);
				bus.on(
					"other",
					() => {
						throw failure;
					},
					options,
				);

				bus.emit("name/changed", "Eva");
				bus.emit("other", 1);
				await settle();
				seen.push(onError.mock.calls.map(([error]) => error));
			}

			expect(seen[0]).toEqual(seen[1]);
			expect(seen[1]).toHaveLength(2);
		});

		it("runs a named listener on a bus with the plugin and no tracer, with off working", () => {
			const bus = createBus<Events>();
			bus.use(tracePlugin());
			const handler = vi.fn();
			bus.on("name/changed", handler, { traceId: "x" });

			bus.emit("name/changed", "Eva");
			bus.off("name/changed", handler);
			bus.emit("name/changed", "Adam");

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("finishes a listener when a logger throws", () => {
			const bus = createBus<Events>({
				trace: createTracer(() => {
					throw new Error("logger");
				}),
			});
			vi.spyOn(console, "error").mockImplementation(() => {});
			bus.use(tracePlugin());
			const handler = vi.fn();
			bus.on("name/changed", handler, { traceId: "x" });

			bus.emit("name/changed", "Eva");

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});
});
