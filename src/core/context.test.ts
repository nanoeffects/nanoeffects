import { describe, expect, it, vi } from "vitest";
import { createHarness } from "../tests/test-helpers";
import { emitAfterAbort } from "./emit-key";

describe("emit after an abort", () => {
	it("does nothing after the abort, as before", () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		const handler = vi.fn();
		harness.bus.on("b", handler);
		ctx.abort();

		ctx.emit("b", "ignored");

		expect(handler).not.toHaveBeenCalled();
	});

	it("emits after the abort while the context lets one emit through", () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		const handler = vi.fn();
		harness.bus.on("b", handler);
		ctx.abort();

		Reflect.set(ctx, emitAfterAbort, true);
		ctx.emit("b", "sent");
		Reflect.set(ctx, emitAfterAbort, false);
		ctx.emit("b", "ignored");

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0]?.[0]).toBe("sent");
	});

	it("keeps the task as the parent of the tasks it starts", () => {
		const harness = createHarness();
		const ctx = harness.ctx();
		harness.bus.on("b", () => {});
		ctx.abort();

		Reflect.set(ctx, emitAfterAbort, true);
		ctx.emit("b", "sent");
		const root = harness.recorder.events.find(
			(event) => event.type === "t" && event.phase === "start",
		);
		const started = harness.recorder.events.find(
			(event) => event.type === "b" && event.phase === "start",
		);

		expect(started?.parent).toBe(root?.id);
	});

	it("is not a field of the public context type", () => {
		const harness = createHarness();
		const ctx = harness.ctx();

		// @ts-expect-error the symbol key is not a field of Context
		expect(ctx[emitAfterAbort]).toBeUndefined();
	});
});
