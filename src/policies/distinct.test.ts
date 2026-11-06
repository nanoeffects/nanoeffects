import { describe, expect, it, vi } from "vitest";
import { callLifecycle, reportsLifecycle } from "../core/lifecycle-key";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { type DistinctOptions, distinct } from "./distinct";
import { withPolicy } from "./with-policy";

// the events of the harness are pinned, so a context of the harness fits
const distinctTask = <P, R>(
	handler: Task<P, TestEvents, R>,
	options?: DistinctOptions<P>,
) => distinct(handler, options);

const lifecycle = () => ({
	start: vi.fn(),
	drop: vi.fn(),
	cancel: vi.fn(),
	done: vi.fn(),
});

describe("distinct", () => {
	describe("skipping a repeat", () => {
		it("runs the first call and skips the same primitive that follows", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value * 2);
			const once = distinctTask(handler);

			expect(once(2, harness.ctx())).toBe(4);
			expect(once(2, harness.ctx())).toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("runs again when the payload changes in between", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const once = distinctTask(handler);
			for (const value of [1, 2, 1]) {
				once(value, harness.ctx());
			}

			expect(handler.mock.calls.map((call) => call[0])).toEqual([1, 2, 1]);
		});

		it("tells two equal objects apart without a comparer", () => {
			const harness = createHarness();
			const handler = vi.fn((_draft: { id: number }) => 1);
			const once = distinctTask(handler);
			once({ id: 1 }, harness.ctx());
			once({ id: 1 }, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("uses options.equals when it is given", () => {
			const harness = createHarness();
			const handler = vi.fn((_draft: { id: number }) => 1);
			const once = distinctTask(handler, {
				equals: (previous, next) => previous.id === next.id,
			});
			once({ id: 1 }, harness.ctx());
			once({ id: 1 }, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("hands the previous and the next payload to equals, in that order", () => {
			const harness = createHarness();
			const equals = vi.fn(
				(previous: number, next: number) => previous === next,
			);
			const once = distinctTask((value: number) => value, { equals });
			once(1, harness.ctx());
			once(2, harness.ctx());

			expect(equals).toHaveBeenCalledWith(1, 2);
		});

		it("treats NaN as equal to NaN, as Object.is does", () => {
			const harness = createHarness();
			const handler = vi.fn((_value: number) => 1);
			const once = distinctTask(handler);
			once(Number.NaN, harness.ctx());
			once(Number.NaN, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("does not change what is remembered by a skipped call", () => {
			const harness = createHarness();
			const equals = vi.fn(
				(previous: number, next: number) => previous === next,
			);
			const once = distinctTask((value: number) => value, { equals });
			once(1, harness.ctx());
			once(1, harness.ctx());
			once(1, harness.ctx());

			expect(equals).toHaveBeenCalledTimes(2);
			expect(equals).toHaveBeenNthCalledWith(2, 1, 1);
		});

		it("keeps a synchronous handler synchronous", () => {
			const harness = createHarness();
			const result = distinctTask((value: number) => value * 2)(
				2,
				harness.ctx(),
			);

			expect(result).toBe(4);
		});

		it("returns the promise of an asynchronous handler with its value", async () => {
			const harness = createHarness();
			const result = distinctTask(async (value: number) => value + 1)(
				1,
				harness.ctx(),
			);

			await expect(result).resolves.toBe(2);
		});
	});

	describe("what is remembered", () => {
		it("skips the same payload while its run goes", () => {
			const harness = createHarness();
			const handler = vi.fn((_value: number) => new Promise<void>(() => {}));
			const once = distinctTask(handler);
			once(1, harness.ctx());
			once(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("forgets a payload whose run rejected, so a retry runs", async () => {
			const harness = createHarness();
			const handler = vi
				.fn<(value: number) => Promise<string>>()
				.mockRejectedValueOnce(new Error("first"))
				.mockResolvedValueOnce("second");
			const once = distinctTask(handler);

			await expect(once(1, harness.ctx())).rejects.toThrow("first");
			await expect(once(1, harness.ctx())).resolves.toBe("second");
		});

		it("forgets a payload whose handler threw, so a retry runs", () => {
			const harness = createHarness();
			const handler = vi
				.fn<(value: number) => number>()
				.mockImplementationOnce(() => {
					throw new Error("sync");
				})
				.mockReturnValueOnce(5);
			const once = distinctTask(handler);

			expect(() => once(1, harness.ctx())).toThrow("sync");
			expect(once(1, harness.ctx())).toBe(5);
		});

		it("forgets a payload whose task aborted, so a retry runs", () => {
			const harness = createHarness();
			const handler = vi.fn((_value: number) => new Promise<void>(() => {}));
			const once = distinctTask(handler);
			const ctx = harness.ctx();
			once(1, ctx);
			ctx.abort();
			once(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("keeps a payload whose run resolved", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const once = distinctTask(handler);
			await once(1, harness.ctx());
			await once(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("does not forget a newer payload when an older run fails late", async () => {
			const harness = createHarness();
			const gate = deferred<void>();
			const handler = vi.fn((value: number) =>
				value === 1 ? gate.promise : Promise.resolve(),
			);
			const once = distinctTask(handler);
			const first = once(1, harness.ctx());
			once(2, harness.ctx());
			gate.reject(new Error("late"));
			await expect(first).rejects.toThrow("late");
			once(2, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("does nothing for a call whose task is aborted already", () => {
			const harness = createHarness();
			const handler = vi.fn();
			const ctx = harness.ctx();
			ctx.abort();

			expect(distinctTask(handler)(1, ctx)).toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});

		it("does not remember the payload of a call whose task is aborted already", () => {
			const harness = createHarness();
			const handler = vi.fn((value: number) => value);
			const once = distinctTask(handler);
			const ctx = harness.ctx();
			ctx.abort();
			once(1, ctx);
			once(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("keys", () => {
		it("remembers a payload for each key", () => {
			const harness = createHarness();
			const handler = vi.fn((_draft: { id: number; text: string }) => 1);
			const once = distinctTask(handler, { key: (draft) => draft.id });
			const first = { id: 1, text: "a" };
			once(first, harness.ctx());
			once({ id: 2, text: "b" }, harness.ctx());
			once(first, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("lets a key change its payload without touching the others", () => {
			const harness = createHarness();
			const handler = vi.fn((_value: string) => 1);
			const once = distinctTask(handler, { key: (value) => value[0] });
			for (const value of ["a1", "b1", "a2", "b1", "a2"]) {
				once(value, harness.ctx());
			}

			expect(handler.mock.calls.map((call) => call[0])).toEqual([
				"a1",
				"b1",
				"a2",
			]);
		});
	});

	describe("job lifecycle", () => {
		it("is marked as a policy that reports", () => {
			expect(
				Reflect.get(
					distinct(() => 1),
					reportsLifecycle,
				),
			).toBe(true);
		});

		it("drops a skipped call and starts an accepted one", () => {
			const harness = createHarness();
			const once = distinctTask((value: number) => value);
			const accepted = lifecycle();
			const skipped = lifecycle();
			const first = harness.ctx();
			const second = harness.ctx();
			Reflect.set(first, callLifecycle, accepted);
			Reflect.set(second, callLifecycle, skipped);
			once(1, first);
			once(1, second);

			expect(accepted.start).toHaveBeenCalledTimes(1);
			expect(accepted.drop).not.toHaveBeenCalled();
			expect(skipped.start).not.toHaveBeenCalled();
			expect(skipped.drop).toHaveBeenCalledTimes(1);
		});

		it("traces a skipped call as a drop", () => {
			const harness = createHarness();
			const once = distinctTask((value: number) => value);
			once(1, harness.ctx());
			once(1, harness.ctx());

			expect(harness.phases()).toContain("distinct/drop");
		});
	});

	describe("forms", () => {
		it("behaves the same in the wrapper form", () => {
			const harness = createHarness();
			const handler = vi.fn((_value: number) => 1);
			const once = distinct({ key: (value: number) => value % 2 })<
				TestEvents,
				number
			>(handler);
			once(1, harness.ctx());
			once(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("makes a new policy, with its own memory, each time the wrapper is called", () => {
			const harness = createHarness();
			const handler = vi.fn((_value: number) => 1);
			const wrap = distinct();
			const left = wrap<number, TestEvents, number>(handler);
			const right = wrap<number, TestEvents, number>(handler);
			left(1, harness.ctx());
			right(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("accepts null options as the defaults", () => {
			const harness = createHarness();
			const handler = vi.fn((_value: number) => 1);
			const once = distinctTask(handler, { key: null, equals: null } as never);
			once(1, harness.ctx());
			once(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("works as a plain function through withPolicy", async () => {
			const handler = vi.fn((_text: string) => "saved");
			const save = withPolicy(distinct(handler));

			await expect(save("a")).resolves.toBe("saved");
			await expect(save("a")).resolves.toBeUndefined();
			await expect(save("b")).resolves.toBe("saved");
			expect(handler).toHaveBeenCalledTimes(2);
		});
	});
});
