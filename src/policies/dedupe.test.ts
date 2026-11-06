import { describe, expect, it, vi } from "vitest";
import { callLifecycle, reportsLifecycle } from "../core/lifecycle-key";
import type { Task } from "../core/types";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { type DedupeOptions, dedupe } from "./dedupe";
import { withPolicy } from "./with-policy";

// the events of the harness are pinned, so a context of the harness fits
const dedupeTask = <P, R>(
	handler: Task<P, TestEvents, R>,
	options?: DedupeOptions<P>,
) => dedupe(handler, options);

const lifecycle = () => ({
	start: vi.fn(),
	drop: vi.fn(),
	cancel: vi.fn(),
	done: vi.fn(),
});

describe("dedupe", () => {
	describe("sharing", () => {
		it("runs the handler once for two calls with the same payload", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const handler = vi.fn(() => gate.promise);
			const shared = dedupeTask(handler);
			const first = shared(1, harness.ctx());
			const second = shared(1, harness.ctx());
			gate.resolve("user");

			expect(handler).toHaveBeenCalledTimes(1);
			await expect(first).resolves.toBe("user");
			await expect(second).resolves.toBe("user");
		});

		it("does not share between different payloads", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value * 10);
			const shared = dedupeTask(handler);
			const results = await Promise.all([
				shared(1, harness.ctx()),
				shared(2, harness.ctx()),
			]);

			expect(handler).toHaveBeenCalledTimes(2);
			expect(results).toEqual([10, 20]);
		});

		it("takes the key from options.key", async () => {
			const harness = createHarness();
			const gate = deferred<number>();
			const handler = vi.fn((_draft: { id: number }) => gate.promise);
			const shared = dedupeTask(handler, { key: (draft) => draft.id });
			const first = shared({ id: 1 }, harness.ctx());
			const second = shared({ id: 1 }, harness.ctx());
			gate.resolve(5);

			expect(handler).toHaveBeenCalledTimes(1);
			await expect(Promise.all([first, second])).resolves.toEqual([5, 5]);
		});

		it("does not match two equal objects without a key", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (_draft: { id: number }) => 1);
			const shared = dedupeTask(handler);
			await Promise.all([
				shared({ id: 1 }, harness.ctx()),
				shared({ id: 1 }, harness.ctx()),
			]);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("shares one run between every call with a constant key", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const handler = vi.fn((_value: number) => gate.promise);
			const shared = dedupeTask(handler, { key: () => "all" });
			const first = shared(1, harness.ctx());
			const second = shared(2, harness.ctx());
			gate.resolve("done");

			expect(handler).toHaveBeenCalledTimes(1);
			await expect(Promise.all([first, second])).resolves.toEqual([
				"done",
				"done",
			]);
		});

		it("gives the run the payload of the first caller", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const shared = dedupeTask(handler, { key: () => "all" });
			const results = await Promise.all([
				shared(1, harness.ctx()),
				shared(2, harness.ctx()),
			]);

			expect(results).toEqual([1, 1]);
		});

		it("rejects every caller with the shared error", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const shared = dedupeTask(() => gate.promise);
			const first = shared(1, harness.ctx());
			const second = shared(1, harness.ctx());
			const failure = new Error("boom");
			gate.reject(failure);

			await expect(first).rejects.toBe(failure);
			await expect(second).rejects.toBe(failure);
		});

		it("turns a synchronous throw into a rejection", async () => {
			const harness = createHarness();
			const failure = new Error("sync");
			const shared = dedupeTask(() => {
				throw failure;
			});

			await expect(shared(1, harness.ctx())).rejects.toBe(failure);
		});

		it("returns a promise for a synchronous handler", async () => {
			const harness = createHarness();
			const result = dedupeTask((value: number) => value * 2)(2, harness.ctx());

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBe(4);
		});
	});

	describe("forgetting", () => {
		it("starts the handler again after a value", async () => {
			const harness = createHarness();
			let count = 0;
			const shared = dedupeTask(async () => ++count);

			await expect(shared(1, harness.ctx())).resolves.toBe(1);
			await expect(shared(1, harness.ctx())).resolves.toBe(2);
		});

		it("starts the handler again after an error", async () => {
			const harness = createHarness();
			const handler = vi
				.fn<(value: number) => Promise<string>>()
				.mockRejectedValueOnce(new Error("first"))
				.mockResolvedValueOnce("second");
			const shared = dedupeTask(handler);

			await expect(shared(1, harness.ctx())).rejects.toThrow("first");
			await expect(shared(1, harness.ctx())).resolves.toBe("second");
		});

		it("lets a call made from the settled handler start a new run", async () => {
			const harness = createHarness();
			let count = 0;
			const shared = dedupeTask(async () => ++count);
			const first = shared(1, harness.ctx());
			const values = [await first, await shared(1, harness.ctx())];

			expect(values).toEqual([1, 2]);
		});
	});

	describe("abort", () => {
		it("resolves a follower that aborts with undefined and lets the rest go on", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const shared = dedupeTask(() => gate.promise);
			const ownerCtx = harness.ctx();
			const followerCtx = harness.ctx();
			const owner = shared(1, ownerCtx);
			const follower = shared(1, followerCtx);
			followerCtx.abort("left");
			gate.resolve("value");

			await expect(follower).resolves.toBeUndefined();
			await expect(owner).resolves.toBe("value");
			expect(ownerCtx.signal.aborted).toBe(false);
		});

		it("starts again for a live follower when the owner aborts", async () => {
			const harness = createHarness();
			const signals: AbortSignal[] = [];
			const gates = [deferred<string>(), deferred<string>()];
			const handler = vi.fn((_value: number, ctx: { signal: AbortSignal }) => {
				signals.push(ctx.signal);
				return gates[signals.length - 1]?.promise;
			});
			const shared = dedupeTask(handler);
			const ownerCtx = harness.ctx();
			const owner = shared(1, ownerCtx);
			const follower = shared(1, harness.ctx());
			ownerCtx.abort("left");
			gates[0]?.resolve("stale");
			gates[1]?.resolve("fresh");

			expect(handler).toHaveBeenCalledTimes(2);
			expect(signals[0]?.aborted).toBe(true);
			expect(signals[1]?.aborted).toBe(false);
			await expect(owner).resolves.toBeUndefined();
			await expect(follower).resolves.toBe("fresh");
		});

		it("ignores the result of a run that was given up", async () => {
			const harness = createHarness();
			const gates = [deferred<string>(), deferred<string>()];
			let started = 0;
			const shared = dedupeTask(() => gates[started++]?.promise);
			const ownerCtx = harness.ctx();
			shared(1, ownerCtx);
			const follower = shared(1, harness.ctx());
			ownerCtx.abort();
			gates[1]?.resolve("fresh");
			await expect(follower).resolves.toBe("fresh");
			gates[0]?.resolve("stale");
			await Promise.resolve();

			expect(started).toBe(2);
		});

		it("runs nothing when every caller has aborted", async () => {
			const harness = createHarness();
			const handler = vi.fn(() => new Promise<string>(() => {}));
			const shared = dedupeTask(handler);
			const firstCtx = harness.ctx();
			const secondCtx = harness.ctx();
			const first = shared(1, firstCtx);
			const second = shared(1, secondCtx);
			secondCtx.abort();
			firstCtx.abort();

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBeUndefined();
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("starts a new run for a call that comes after everyone left", async () => {
			const harness = createHarness();
			const handler = vi.fn(async () => "value");
			const shared = dedupeTask(handler);
			const firstCtx = harness.ctx();
			shared(1, firstCtx);
			firstCtx.abort();

			await expect(shared(1, harness.ctx())).resolves.toBe("value");
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("resolves a call whose task is aborted already, and starts nothing", async () => {
			const harness = createHarness();
			const handler = vi.fn();
			const ctx = harness.ctx();
			ctx.abort();

			await expect(dedupeTask(handler)(1, ctx)).resolves.toBeUndefined();
			expect(handler).not.toHaveBeenCalled();
		});

		it("does not deliver a value to an owner that aborted during the run", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const shared = dedupeTask(() => gate.promise);
			const ctx = harness.ctx();
			const owner = shared(1, ctx);
			ctx.abort();
			gate.resolve("late");

			await expect(owner).resolves.toBeUndefined();
		});
	});

	describe("keys", () => {
		it("forgets the state of a key that went idle", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (value: number) => value);
			const shared = dedupeTask(handler);
			for (let index = 0; index < 1000; index++) {
				await shared(index, harness.ctx());
			}

			expect(handler).toHaveBeenCalledTimes(1000);
		});
	});

	describe("job lifecycle", () => {
		it("is marked as a policy that reports", () => {
			expect(
				Reflect.get(
					dedupeTask(() => 1),
					reportsLifecycle,
				),
			).toBe(true);
		});

		it("tells the job of the owner once, and drops the followers", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const shared = dedupeTask(() => gate.promise);
			const reports = [lifecycle(), lifecycle(), lifecycle()];
			const calls = reports.map((report) => {
				const ctx = harness.ctx();
				Reflect.set(ctx, callLifecycle, report);
				return shared(1, ctx);
			});
			gate.resolve("value");
			await Promise.all(calls);

			expect(reports[0]?.start).toHaveBeenCalledTimes(1);
			expect(reports[0]?.done).toHaveBeenCalledWith({ value: "value" });
			for (const follower of [reports[1], reports[2]]) {
				expect(follower?.start).not.toHaveBeenCalled();
				expect(follower?.drop).toHaveBeenCalledTimes(1);
				expect(follower?.done).not.toHaveBeenCalled();
			}
		});

		it("drops the followers before they hear of an error", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const shared = dedupeTask(() => gate.promise);
			const order: string[] = [];
			const owner = lifecycle();
			const follower = lifecycle();
			follower.drop.mockImplementation(() => order.push("drop"));
			const ownerCtx = harness.ctx();
			const followerCtx = harness.ctx();
			Reflect.set(ownerCtx, callLifecycle, owner);
			Reflect.set(followerCtx, callLifecycle, follower);
			const first = shared(1, ownerCtx);
			const second = shared(1, followerCtx);
			second.catch(() => order.push("rejected"));
			first.catch(() => {});
			gate.reject(new Error("boom"));
			await Promise.allSettled([first, second]);

			expect(order).toEqual(["drop", "rejected"]);
			expect(owner.done).toHaveBeenCalledWith({ error: expect.any(Error) });
		});

		it("cancels the run of an owner that aborted, and starts the follower", async () => {
			const harness = createHarness();
			const gates = [deferred<string>(), deferred<string>()];
			let started = 0;
			const shared = dedupeTask(() => gates[started++]?.promise);
			const owner = lifecycle();
			const follower = lifecycle();
			const order: string[] = [];
			owner.cancel.mockImplementation(() => order.push("owner cancel"));
			follower.start.mockImplementation(() => order.push("follower start"));
			const ownerCtx = harness.ctx();
			const followerCtx = harness.ctx();
			Reflect.set(ownerCtx, callLifecycle, owner);
			Reflect.set(followerCtx, callLifecycle, follower);
			shared(1, ownerCtx);
			const second = shared(1, followerCtx);
			ownerCtx.abort("left");
			gates[1]?.resolve("fresh");
			await second;

			expect(order).toEqual(["owner cancel", "follower start"]);
			expect(follower.done).toHaveBeenCalledWith({ value: "fresh" });
			expect(follower.drop).not.toHaveBeenCalled();
		});

		it("drops a follower that aborts while it waits", async () => {
			const harness = createHarness();
			const shared = dedupeTask(() => new Promise<string>(() => {}));
			const follower = lifecycle();
			const followerCtx = harness.ctx();
			Reflect.set(followerCtx, callLifecycle, follower);
			shared(1, harness.ctx());
			shared(1, followerCtx);
			followerCtx.abort();

			expect(follower.drop).toHaveBeenCalledTimes(1);
			expect(follower.start).not.toHaveBeenCalled();
		});
	});

	describe("trace", () => {
		it("traces the owner as a run and a follower as a drop", async () => {
			const harness = createHarness();
			const gate = deferred<string>();
			const shared = dedupeTask(() => gate.promise);
			const first = shared(1, harness.ctx());
			const second = shared(1, harness.ctx());
			gate.resolve("value");
			await Promise.all([first, second]);

			const phases = harness
				.phases()
				.filter((name) => name.startsWith("dedupe"));
			expect(phases).toContain("dedupe/start");
			expect(phases).toContain("dedupe/done");
			expect(phases).toContain("dedupe/drop");
		});
	});

	describe("forms", () => {
		it("behaves the same in the wrapper form", async () => {
			const harness = createHarness();
			const gate = deferred<number>();
			const handler = vi.fn((_value: number) => gate.promise);
			const shared = dedupe({ key: (value: number) => value % 2 })<
				TestEvents,
				Promise<number>
			>(handler);
			const first = shared(1, harness.ctx());
			const second = shared(3, harness.ctx());
			gate.resolve(7);

			expect(handler).toHaveBeenCalledTimes(1);
			await expect(Promise.all([first, second])).resolves.toEqual([7, 7]);
		});

		it("makes a new policy each time the wrapper is called", async () => {
			const harness = createHarness();
			const gate = deferred<number>();
			const handler = vi.fn((_value: number) => gate.promise);
			const wrap = dedupe();
			const left = wrap<number, TestEvents, Promise<number>>(handler);
			const right = wrap<number, TestEvents, Promise<number>>(handler);
			left(1, harness.ctx());
			right(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(2);
			gate.resolve(0);
		});

		it("accepts a null option as the default", async () => {
			const harness = createHarness();
			const handler = vi.fn(async (_value: number) => 1);
			const shared = dedupeTask(handler, { key: null } as never);
			await shared(1, harness.ctx());

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("works as a plain function through withPolicy", async () => {
			const gate = deferred<string>();
			const handler = vi.fn((_id: number) => gate.promise);
			const load = withPolicy(dedupe(handler));
			const first = load(1);
			const second = load(1);
			gate.resolve("user");

			expect(handler).toHaveBeenCalledTimes(1);
			await expect(first).resolves.toBe("user");
			await expect(second).resolves.toBe("user");
		});

		it("is aborted as a whole by withPolicy.cancel", async () => {
			const handler = vi.fn(
				(_id: number, { signal }: { signal: AbortSignal }) =>
					new Promise<string>((resolve) => {
						signal.addEventListener("abort", () => resolve("late"));
					}),
			);
			const load = withPolicy(dedupe(handler));
			const first = load(1);
			const second = load(1);
			load.cancel();

			await expect(first).resolves.toBeUndefined();
			await expect(second).resolves.toBeUndefined();
		});
	});
});
