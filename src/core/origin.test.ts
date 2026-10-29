import { describe, expect, it, vi } from "vitest";
import { createCommand } from "../actions";
import { noPayload } from "../tests/test-helpers";
import { createTraceRecorder } from "../trace/recorder";
import { createTracer } from "../trace/tracer";
import { createBus } from "./bus";
import { emitFrom } from "./origin";

type Events = { "name/changed": string };

const setup = () => {
	const recorder = createTraceRecorder();
	const bus = createBus<Events>({ trace: createTracer(recorder) });

	return { bus, recorder };
};

describe("emitFrom", () => {
	it("emits from a root task, and a command it emits is its child", async () => {
		const recorder = createTraceRecorder();
		const bus = createBus({ trace: createTracer(recorder) });
		const save = createCommand("user/save", async (_: undefined) => 1);
		bus.commands = {
			run: (command, payload, ctx) =>
				Reflect.apply(command, null, [payload, ctx]),
		};

		emitFrom(bus, save(noPayload), { traceId: "Profile" });
		await Promise.resolve();

		const root = recorder.events.find((event) => event.type === "Profile");
		const child = recorder.events.find((event) => event.type === "user/save");
		expect(root?.effect).toBe("run");
		expect(root?.phase).toBe("start");
		expect(child?.parentId).toBe(root?.id);
	});

	it("reports start and done of the root", () => {
		const { bus, recorder } = setup();
		bus.on("name/changed", () => {});

		emitFrom(
			bus,
			{ type: "name/changed", payload: "Eva" },
			{ traceId: "Profile" },
		);

		expect(
			recorder.events.map(
				(event) => `${event.type}/${event.effect}/${event.phase}`,
			),
		).toEqual(["Profile/run/start", "Profile/run/done"]);
	});

	it("names the root after the event when there is no traceId", () => {
		const { bus, recorder } = setup();
		bus.on("name/changed", () => {});

		emitFrom(bus, { type: "name/changed", payload: "Eva" });

		expect(recorder.events[0]?.type).toBe("name/changed");
	});

	it("gives the group to the root and to what it starts", async () => {
		const { bus, recorder } = setup();
		const save = createCommand("user/save", async (_: undefined) => 1);
		bus.on("name/changed", async (_name, ctx) => {
			await ctx.emit(save(noPayload));
		});

		emitFrom(
			bus,
			{ type: "name/changed", payload: "Eva" },
			{ traceId: "Profile", traceGroupId: "checkout" },
		);
		await Promise.resolve();

		expect(
			recorder.events.every((event) => event.traceGroupId === "checkout"),
		).toBe(true);
	});

	it("reports an error of a listener and throws it", () => {
		const { bus, recorder } = setup();
		bus.on("name/changed", () => {
			throw new Error("boom");
		});

		expect(() =>
			emitFrom(
				bus,
				{ type: "name/changed", payload: "Eva" },
				{ traceId: "Profile" },
			),
		).toThrow("boom");
		expect(recorder.events.at(-1)?.phase).toBe("error");
	});

	it("is a plain bus.emit without a tracer, whatever the options", () => {
		const bus = createBus<Events>();
		const handler = vi.fn();
		bus.on("name/changed", handler);

		emitFrom(
			bus,
			{ type: "name/changed", payload: "Eva" },
			{ traceId: "Profile", traceGroupId: "checkout" },
		);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0]?.[0]).toBe("Eva");
	});
});
