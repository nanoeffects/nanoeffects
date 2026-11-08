import { getEventListeners } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { latest, queue } from "../policies";
import {
	createHarness,
	deferred,
	type TestEvents,
} from "../tests/test-helpers";
import { all, effectsPlugin, retry, transaction } from ".";

type Journal = string[];

// a step that writes what it did, returns its name, and rolls back by that name
const stepNamed = (journal: Journal, name: string) => ({
	run: async () => {
		journal.push(`run ${name}`);

		return name;
	},
	rollback: (value: string) => {
		journal.push(`rollback ${value}`);
	},
});

const failing = (journal: Journal, message = "boom") => ({
	run: async () => {
		journal.push("run failing");
		throw new Error(message);
	},
	rollback: () => {
		journal.push("rollback failing");
	},
});

const hangUntilAbort = ({ signal }: { signal: AbortSignal }) =>
	new Promise<never>((_, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});

const errorOf = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		return error;
	}

	throw new Error("expected the promise to reject");
};

describe("transaction", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("steps", () => {
		it("runs the steps in order, one at a time, and gives their values", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const first = deferred<void>();
			const slow = {
				run: async () => {
					journal.push("start slow");
					await first.promise;
					journal.push("end slow");

					return 1;
				},
			};
			const next = {
				run: async () => {
					journal.push("run next");

					return 2;
				},
			};

			const result = transaction(harness.ctx(), [slow, next]);
			await vi.advanceTimersByTimeAsync(0);
			expect(journal).toEqual(["start slow"]);

			first.resolve();

			await expect(result).resolves.toEqual([1, 2]);
			expect(journal).toEqual(["start slow", "end slow", "run next"]);
		});

		it("resolves with an empty list and calls nothing", async () => {
			const harness = createHarness();

			await expect(transaction(harness.ctx(), [])).resolves.toEqual([]);
		});

		it("gives a step a signal that aborts with the task", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const seen: AbortSignal[] = [];

			const result = transaction(ctx, [
				{
					run: ({ signal }) => {
						seen.push(signal);

						return hangUntilAbort({ signal });
					},
				},
			]);
			await vi.advanceTimersByTimeAsync(0);
			expect(seen[0]?.aborted).toBe(false);

			ctx.abort();

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(seen[0]?.aborted).toBe(true);
		});
	});

	describe("rollback", () => {
		it("rolls back the finished steps, last first, and rejects with the error", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = transaction(harness.ctx(), [
				stepNamed(journal, "a"),
				stepNamed(journal, "b"),
				failing(journal),
				stepNamed(journal, "never"),
			]);

			await expect(result).rejects.toThrow("boom");
			expect(journal).toEqual([
				"run a",
				"run b",
				"run failing",
				"rollback b",
				"rollback a",
			]);
		});

		it("calls no rollback when the first step fails", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = transaction(harness.ctx(), [
				failing(journal),
				stepNamed(journal, "a"),
			]);

			await expect(result).rejects.toThrow("boom");
			expect(journal).toEqual(["run failing"]);
		});

		it("skips a step with no rollback", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const reader = {
				run: async () => {
					journal.push("run reader");

					return 0;
				},
			};

			const result = transaction(harness.ctx(), [
				stepNamed(journal, "a"),
				reader,
				failing(journal),
			]);

			await expect(result).rejects.toThrow("boom");
			expect(journal).toEqual([
				"run a",
				"run reader",
				"run failing",
				"rollback a",
			]);
		});

		it("gives rollback the value of its run and nothing else", async () => {
			const harness = createHarness();
			const rollback = vi.fn();

			const result = transaction(harness.ctx(), [
				{ run: async () => "order-7", rollback },
				{
					run: async () => {
						throw new Error("boom");
					},
				},
			]);

			await expect(result).rejects.toThrow("boom");
			expect(rollback).toHaveBeenCalledTimes(1);
			expect(rollback.mock.calls[0]).toEqual(["order-7"]);
		});
	});

	describe("abort", () => {
		it("does not cut the rollback that the abort started", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];
			const hanging = { run: hangUntilAbort, rollback: () => {} };

			const result = transaction(ctx, [
				stepNamed(journal, "a"),
				stepNamed(journal, "b"),
				hanging,
			]);
			await vi.advanceTimersByTimeAsync(0);
			ctx.abort();

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(journal).toEqual(["run a", "run b", "rollback b", "rollback a"]);
		});

		it("starts no step after an abort between two steps, and rolls back", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];
			const abortsItself = {
				run: async () => {
					journal.push("run first");
					ctx.abort();

					return "first";
				},
				rollback: (value: string) => {
					journal.push(`rollback ${value}`);
				},
			};

			const result = transaction(ctx, [abortsItself, stepNamed(journal, "b")]);

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(journal).toEqual(["run first", "rollback first"]);
		});

		it("rolls back a step that ignored the signal and finished after the abort", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];
			const gate = deferred<string>();
			const deaf = {
				run: () => gate.promise,
				rollback: (value: string) => {
					journal.push(`rollback ${value}`);
				},
			};

			const result = transaction(ctx, [stepNamed(journal, "a"), deaf]);
			await vi.advanceTimersByTimeAsync(0);
			ctx.abort();
			await vi.advanceTimersByTimeAsync(0);
			gate.resolve("deaf");

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(journal).toEqual(["run a", "rollback deaf", "rollback a"]);
		});

		it("rejects with the abort reason and starts nothing when the context is already aborted", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];
			ctx.abort();

			const result = transaction(ctx, [stepNamed(journal, "a")]);

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(journal).toEqual([]);
		});
	});

	describe("strategy options", () => {
		it("lets a step win over the options", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];
			const keepsOnAbort = {
				...stepNamed(journal, "a"),
				rollbackOn: "both",
			} as const;
			const lastStep = {
				run: async () => {
					ctx.abort();

					return "b";
				},
				rollback: (value: string) => {
					journal.push(`rollback ${value}`);
				},
			};

			const result = transaction(ctx, [keepsOnAbort, lastStep], {
				rollbackOn: "error",
			});

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(journal).toEqual(["run a", "rollback a"]);
		});

		it("uses the defaults: both cases, reverse order, continue after a failed rollback", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const brokenRollback = {
				run: async () => "b",
				rollback: () => {
					journal.push("rollback b");
					throw new Error("oops");
				},
			};

			const result = transaction(harness.ctx(), [
				stepNamed(journal, "a"),
				brokenRollback,
				failing(journal),
			]);

			await expect(result).rejects.toBeInstanceOf(AggregateError);
			expect(journal).toEqual([
				"run a",
				"run failing",
				"rollback b",
				"rollback a",
			]);
		});

		it("falls back for null, in the options and in a step", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];
			const nullStep = { ...stepNamed(journal, "a"), rollbackOn: null };
			const abortsLast = {
				run: async () => {
					ctx.abort();

					return "b";
				},
			};

			const result = transaction(ctx, [nullStep, abortsLast], {
				rollbackOn: "abort",
				rollbackFailure: null,
				rollbackOrder: null,
			});

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(journal).toEqual(["run a", "rollback a"]);
		});

		it("rejects a wrong value before any step starts", () => {
			const harness = createHarness();
			const journal: Journal = [];
			const steps = [stepNamed(journal, "a")];

			expect(() =>
				// @ts-expect-error not one of the three words
				transaction(harness.ctx(), steps, { rollbackOn: "sometimes" }),
			).toThrow(RangeError);
			expect(() =>
				// @ts-expect-error not one of the two words
				transaction(harness.ctx(), steps, { rollbackFailure: "retry" }),
			).toThrow(RangeError);
			expect(() =>
				// @ts-expect-error not one of the two words
				transaction(harness.ctx(), steps, { rollbackOrder: "forward" }),
			).toThrow(RangeError);
			expect(() =>
				transaction(harness.ctx(), [
					{ ...stepNamed(journal, "a"), rollbackOn: "x" as never },
				]),
			).toThrow(RangeError);
			expect(journal).toEqual([]);
		});

		it("rejects stop with parallel before any step starts", () => {
			const harness = createHarness();
			const journal: Journal = [];

			expect(() =>
				transaction(harness.ctx(), [stepNamed(journal, "a")], {
					rollbackOrder: "parallel",
					rollbackFailure: "stop",
				}),
			).toThrow(TypeError);
			expect(() =>
				transaction(
					harness.ctx(),
					[{ ...stepNamed(journal, "a"), rollbackFailure: "stop" }],
					{ rollbackOrder: "parallel" },
				),
			).toThrow(TypeError);
			expect(journal).toEqual([]);
		});
	});

	describe("rollbackOn", () => {
		it("does not roll back an aborted task when the step says error", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];
			const abortsLast = {
				run: async () => {
					ctx.abort();

					return "b";
				},
			};

			const result = transaction(ctx, [stepNamed(journal, "a"), abortsLast], {
				rollbackOn: "error",
			});

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(journal).toEqual(["run a"]);
		});

		it("does not roll back a failed step when the option says abort", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = transaction(
				harness.ctx(),
				[stepNamed(journal, "a"), failing(journal)],
				{ rollbackOn: "abort" },
			);

			await expect(result).rejects.toThrow("boom");
			expect(journal).toEqual(["run a", "run failing"]);
		});
	});

	describe("rollbackFailure", () => {
		const threeSteps = (journal: Journal, middle: object) => [
			stepNamed(journal, "a"),
			{
				run: async () => "b",
				rollback: () => {
					journal.push("rollback b");
					throw new Error("oops");
				},
				...middle,
			},
			failing(journal, "boom"),
		];

		it("goes on after a failed rollback and collects the errors, original first", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const error = await errorOf(
				transaction(harness.ctx(), threeSteps(journal, {})),
			);

			expect(error).toBeInstanceOf(AggregateError);
			const messages = (error as AggregateError).errors.map(
				(item: Error) => item.message,
			);
			expect(messages).toEqual(["boom", "oops"]);
			expect(journal).toContain("rollback a");
		});

		it("stops after a failed rollback of a step that says stop", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const error = await errorOf(
				transaction(
					harness.ctx(),
					threeSteps(journal, { rollbackFailure: "stop" }),
				),
			);

			expect(error).toBeInstanceOf(AggregateError);
			expect(journal).not.toContain("rollback a");
		});

		it("puts the abort reason first when a rollback fails after an abort", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const brokenRollback = {
				run: async () => 1,
				rollback: () => {
					throw new Error("oops");
				},
			};
			const hanging = { run: hangUntilAbort };

			const result = transaction(ctx, [brokenRollback, hanging]);
			await vi.advanceTimersByTimeAsync(0);
			ctx.abort();

			const error = await errorOf(result);
			expect(error).toBeInstanceOf(AggregateError);
			const [first, second] = (error as AggregateError).errors;
			expect(first).toBe(ctx.signal.reason);
			expect((second as Error).message).toBe("oops");
		});

		it("rejects with the original error itself when no rollback failed", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const error = await errorOf(
				transaction(harness.ctx(), [stepNamed(journal, "a"), failing(journal)]),
			);

			expect(error).not.toBeInstanceOf(AggregateError);
			expect((error as Error).message).toBe("boom");
		});
	});

	describe("rollbackOrder", () => {
		it("calls all rollbacks at once in parallel and waits for all", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
			const gated = gates.map((gate, index) => ({
				run: async () => index,
				rollback: async (value: number) => {
					journal.push(`start ${value}`);
					await gate.promise;
					journal.push(`end ${value}`);
				},
			}));
			let settled = false;

			const result = transaction(harness.ctx(), [...gated, failing(journal)], {
				rollbackOrder: "parallel",
			});
			result
				.catch(() => {})
				.finally(() => {
					settled = true;
				});
			await vi.advanceTimersByTimeAsync(0);

			expect(journal.filter((line) => line.startsWith("start"))).toHaveLength(
				3,
			);
			expect(journal.some((line) => line.startsWith("end"))).toBe(false);

			gates[0]?.resolve();
			gates[1]?.resolve();
			await vi.advanceTimersByTimeAsync(0);
			expect(settled).toBe(false);

			gates[2]?.resolve();
			await expect(result).rejects.toThrow("boom");
			expect(settled).toBe(true);
		});

		it("collects the failure of one parallel rollback after calling the others", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const broken = {
				run: async () => "b",
				rollback: () => {
					throw new Error("oops");
				},
			};

			const error = await errorOf(
				transaction(
					harness.ctx(),
					[stepNamed(journal, "a"), broken, failing(journal)],
					{ rollbackOrder: "parallel" },
				),
			);

			expect(error).toBeInstanceOf(AggregateError);
			expect(journal).toContain("rollback a");
			expect((error as AggregateError).errors).toHaveLength(2);
		});
	});

	describe("settling", () => {
		it("keeps the result pending until a slow rollback has finished", async () => {
			const harness = createHarness();
			let settled = false;
			const slow = {
				run: async () => 1,
				rollback: () =>
					new Promise<void>((resolve) => {
						setTimeout(resolve, 100);
					}),
			};

			const result = transaction(harness.ctx(), [
				slow,
				{
					run: async () => {
						throw new Error("boom");
					},
				},
			]);
			result
				.catch(() => {})
				.finally(() => {
					settled = true;
				});

			await vi.advanceTimersByTimeAsync(99);
			expect(settled).toBe(false);

			await vi.advanceTimersByTimeAsync(1);
			expect(settled).toBe(true);
			await expect(result).rejects.toThrow("boom");
		});

		it("frees the slot of a queue handler only after the rollback", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const slowRollback = {
				run: async () => 1,
				rollback: () =>
					new Promise<void>((resolve) => {
						setTimeout(() => {
							journal.push("rollback done");
							resolve();
						}, 100);
					}),
			};
			harness.bus.on(
				"t",
				queue<number, TestEvents, void>(async (payload, ctx) => {
					if (payload === 2) {
						journal.push("second started");

						return;
					}
					await transaction(ctx, [
						slowRollback,
						{
							run: async () => {
								throw new Error("boom");
							},
						},
					]).catch(() => {});
				}),
			);

			harness.bus.emit("t", 1);
			harness.bus.emit("t", 2);
			await vi.advanceTimersByTimeAsync(200);

			expect(journal).toEqual(["rollback done", "second started"]);
		});
	});

	describe("latest", () => {
		it("starts the next call at once, so its steps can overlap the rollback of the one it aborted", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const slowRollback = {
				run: async () => 1,
				rollback: () =>
					new Promise<void>((resolve) => {
						setTimeout(() => {
							journal.push("rollback done");
							resolve();
						}, 100);
					}),
			};
			harness.bus.on(
				"t",
				latest<number, TestEvents, void>(async (payload, ctx) => {
					if (payload === 2) {
						journal.push("second started");

						return;
					}
					await transaction(ctx, [slowRollback, { run: hangUntilAbort }]).catch(
						() => {},
					);
				}),
			);

			harness.bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(0);
			harness.bus.emit("t", 2);
			await vi.advanceTimersByTimeAsync(200);

			expect(journal).toEqual(["second started", "rollback done"]);
		});
	});

	describe("wrapping a rollback", () => {
		it("counts a retried rollback as done when a later attempt succeeds", async () => {
			const harness = createHarness();
			const cancel = vi
				.fn()
				.mockRejectedValueOnce(new Error("one"))
				.mockRejectedValueOnce(new Error("two"))
				.mockResolvedValue(void 0);
			const retried = {
				run: async () => "order",
				rollback: (value: string) =>
					retry({}, () => cancel(value), { times: 3 }),
			};

			const result = transaction(harness.ctx(), [
				retried,
				{
					run: async () => {
						throw new Error("boom");
					},
				},
			]);

			const error = await errorOf(result);
			expect(error).not.toBeInstanceOf(AggregateError);
			expect((error as Error).message).toBe("boom");
			expect(cancel).toHaveBeenCalledTimes(3);
		});

		it("reports the last error of a rollback that keeps failing", async () => {
			const harness = createHarness();
			const cancel = vi.fn().mockRejectedValue(new Error("down"));
			const retried = {
				run: async () => "order",
				rollback: (value: string) =>
					retry({}, () => cancel(value), { times: 2 }),
			};

			const error = await errorOf(
				transaction(harness.ctx(), [
					retried,
					{
						run: async () => {
							throw new Error("boom");
						},
					},
				]),
			);

			expect(error).toBeInstanceOf(AggregateError);
			const messages = (error as AggregateError).errors.map(
				(item: Error) => item.message,
			);
			expect(messages).toEqual(["boom", "down"]);
		});
	});

	describe("tracing", () => {
		// the phases of the transaction group and of its `run` children, in order
		const phasesOf = (harness: ReturnType<typeof createHarness>) =>
			harness
				.phases()
				.filter(
					(phase) =>
						phase.startsWith("transaction/") || phase.startsWith("run/"),
				);

		it("shows a group with a run child for each step, and ends it with error when a step fails", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = transaction(harness.ctx(), [
				stepNamed(journal, "a"),
				failing(journal),
			]);
			await result.catch(() => {});

			expect(phasesOf(harness)).toEqual([
				"transaction/start",
				"run/start",
				"run/done",
				"run/start",
				"run/error",
				"transaction/error",
			]);
		});

		it("ends the group with done when every step finished, with no event for a rollback", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			await transaction(harness.ctx(), [stepNamed(journal, "a")]);

			expect(phasesOf(harness)).toEqual([
				"transaction/start",
				"run/start",
				"run/done",
				"transaction/done",
			]);
		});

		it("ends the group with cancel when the task is aborted, and shows no rollback", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];

			const result = transaction(ctx, [
				stepNamed(journal, "a"),
				{ run: hangUntilAbort },
			]);
			await vi.advanceTimersByTimeAsync(0);
			ctx.abort();
			await result.catch(() => {});

			const phases = phasesOf(harness);
			expect(
				phases.filter((phase) => phase.startsWith("transaction/")),
			).toEqual(["transaction/start", "transaction/cancel"]);
			expect(phases.filter((phase) => phase === "run/start")).toHaveLength(2);
			expect(journal).toContain("rollback a");
		});
	});

	describe("steps as arguments", () => {
		it("gives the same result and rollback as the array", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const result = transaction(
				harness.ctx(),
				stepNamed(journal, "a"),
				stepNamed(journal, "b"),
				failing(journal),
			);

			await expect(result).rejects.toThrow("boom");
			expect(journal).toEqual([
				"run a",
				"run b",
				"run failing",
				"rollback b",
				"rollback a",
			]);
		});

		it("returns the values in the order of the steps", async () => {
			const harness = createHarness();
			const values = await transaction(
				harness.ctx(),
				{ run: async () => "order" },
				{ run: () => 42 },
			);

			expect(values).toEqual(["order", 42]);
		});

		it("takes options in front of the steps, and null for none", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const gate = deferred<void>();
			const gated = (name: string) => ({
				run: async () => name,
				rollback: async (value: string) => {
					journal.push(`start ${value}`);
					await gate.promise;
				},
			});

			const result = transaction(
				harness.ctx(),
				{ rollbackOrder: "parallel" },
				gated("a"),
				gated("b"),
				failing(journal),
			);
			result.catch(() => {});
			await vi.advanceTimersByTimeAsync(0);

			expect(journal.filter((line) => line.startsWith("start")).sort()).toEqual(
				["start a", "start b"],
			);
			gate.resolve();
			await expect(result).rejects.toThrow("boom");

			const plain = await transaction(harness.ctx(), null, { run: () => 1 });
			expect(plain).toEqual([1]);
		});

		it("is a starter without a context, with and without options", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const plain = transaction(
				stepNamed(journal, "a"),
				stepNamed(journal, "b"),
			);
			const limited = transaction(
				{ rollbackFailure: "stop" },
				stepNamed(journal, "c"),
			);
			const nulled = transaction(null, stepNamed(journal, "d"));

			expect(typeof plain).toBe("function");
			expect(typeof limited).toBe("function");
			expect(typeof nulled).toBe("function");
			expect(journal).toEqual([]);
			const result = await all(harness.ctx(), { plain, limited, nulled });

			expect(result).toEqual({
				plain: ["a", "b"],
				limited: ["c"],
				nulled: ["d"],
			});
		});

		it("tells a context from options by its signal, and {} is options", async () => {
			const controller = new AbortController();
			const harness = createHarness();
			const fromController = transaction(controller, { run: () => 1 });
			const fromSignal = transaction(
				{ signal: controller.signal },
				{ run: () => 3 },
			);
			const empty = transaction({}, { run: () => 2 });

			expect(fromController).toBeInstanceOf(Promise);
			expect(fromSignal).toBeInstanceOf(Promise);
			expect(await fromController).toEqual([1]);
			expect(await fromSignal).toEqual([3]);
			expect(typeof empty).toBe("function");
			expect(await all(harness.ctx(), { empty })).toEqual({ empty: [2] });
		});

		it("takes {} as a context in the array form", async () => {
			const values = await transaction({}, [{ run: () => 1 }]);

			expect(values).toEqual([1]);
		});

		it("checks the options and starts nothing for a wrong word", () => {
			const harness = createHarness();
			const run = vi.fn(() => 1);

			expect(() =>
				transaction(
					harness.ctx(),
					{ rollbackOn: "sometimes" as never },
					{ run },
				),
			).toThrow(RangeError);
			expect(run).not.toHaveBeenCalled();
		});

		it("throws a TypeError for no steps or a value that is not a step", () => {
			const harness = createHarness();

			expect(() => (transaction as never as () => unknown)()).toThrow(
				TypeError,
			);
			expect(() =>
				(transaction as (...args: unknown[]) => unknown)(harness.ctx(), {}, 5),
			).toThrow(TypeError);
		});

		it("is bound to the task by effectsPlugin with options in front", async () => {
			const journal: Journal = [];
			const bus = createBus().use(effectsPlugin({ transaction }));
			const done = new Promise<unknown>((resolve) => {
				bus.on("go", async (_, { transaction: bound }) => {
					resolve(
						await bound(
							{ rollbackOn: "error" },
							stepNamed(journal, "a"),
							stepNamed(journal, "b"),
						),
					);
				});
			});
			bus.emit("go", void 0);

			expect(await done).toEqual(["a", "b"]);
		});
	});

	describe("call forms", () => {
		it("rolls back a transaction that a group aborts", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const user = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error("user failed")), 10);
			});

			const result = all(harness.ctx(), {
				order: transaction([
					stepNamed(journal, "a"),
					{ run: hangUntilAbort, rollback: () => {} },
				]),
				user: () => user,
			});
			result.catch(() => {});
			await vi.advanceTimersByTimeAsync(10);
			await vi.advanceTimersByTimeAsync(0);

			await expect(result).rejects.toThrow("user failed");
			expect(journal).toEqual(["run a", "rollback a"]);
		});

		it("takes options in the starter form", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const gate = deferred<void>();
			const gated = (name: string) => ({
				run: async () => name,
				rollback: async (value: string) => {
					journal.push(`start ${value}`);
					await gate.promise;
				},
			});
			const user = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error("user failed")), 10);
			});

			const result = all(harness.ctx(), {
				order: transaction([gated("a"), gated("b"), { run: hangUntilAbort }], {
					rollbackOrder: "parallel",
				}),
				user: () => user,
			});
			result.catch(() => {});
			await vi.advanceTimersByTimeAsync(10);
			await vi.advanceTimersByTimeAsync(0);

			expect(journal.sort()).toEqual(["start a", "start b"]);
			gate.resolve();
			await expect(result).rejects.toThrow("user failed");
		});

		it("throws a TypeError for a context with no steps", () => {
			const harness = createHarness();

			// @ts-expect-error a lone context has no steps
			expect(() => transaction(harness.ctx())).toThrow(TypeError);
		});

		it("is bound to the task by effectsPlugin and takes options", async () => {
			const bus = createBus<TestEvents>().use(effectsPlugin({ transaction }));
			const journal: Journal = [];
			const results: Array<[string, string]> = [];

			bus.on("t", async (_, ctx) => {
				const values = await ctx.transaction(
					[stepNamed(journal, "a"), stepNamed(journal, "b")],
					{ rollbackOrder: "parallel" },
				);
				results.push([values[0], values[1]]);
			});
			bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(0);

			expect(results).toEqual([["a", "b"]]);
		});
	});

	describe("scope form", () => {
		// the same steps as `stepNamed`, for `step(run, rollback)`
		const named = (journal: Journal, name: string) => stepNamed(journal, name);

		it("passes the value of a step to the next one through a variable and gives what the body returns", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = await transaction(harness.ctx(), async (step) => {
				const first = named(journal, "a");
				const name = await step(first.run, first.rollback);
				const second = await step(async () => {
					journal.push(`run after ${name}`);

					return name.length;
				});

				return { name, second };
			});

			expect(result).toEqual({ name: "a", second: 1 });
			expect(journal).toEqual(["run a", "run after a"]);
		});

		it("rolls nothing back when the body returns", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = await transaction(harness.ctx(), async (step) => {
				const a = named(journal, "a");
				const b = named(journal, "b");
				await step(a.run, a.rollback);
				await step(b.run, b.rollback);

				return "done";
			});

			expect(result).toBe("done");
			expect(journal).toEqual(["run a", "run b"]);
		});

		it("gives a step a signal that aborts with the task", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const seen: AbortSignal[] = [];

			const result = transaction(ctx, async (step) => {
				await step(({ signal }) => {
					seen.push(signal);

					return hangUntilAbort({ signal });
				});
			});
			await vi.advanceTimersByTimeAsync(0);
			expect(seen[0]?.aborted).toBe(false);

			ctx.abort();

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(seen[0]?.aborted).toBe(true);
		});

		it("rolls back the finished steps, last first, and not the one that failed", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = transaction(harness.ctx(), async (step) => {
				const a = named(journal, "a");
				const b = named(journal, "b");
				const broken = failing(journal);
				await step(a.run, a.rollback);
				await step(b.run, b.rollback);
				await step(broken.run, broken.rollback);
			});

			expect(await errorOf(result)).toHaveProperty("message", "boom");
			expect(journal).toEqual([
				"run a",
				"run b",
				"run failing",
				"rollback b",
				"rollback a",
			]);
		});

		it("rolls back the steps when the body throws after them", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = transaction(harness.ctx(), async (step) => {
				const a = named(journal, "a");
				const b = named(journal, "b");
				await step(a.run, a.rollback);
				await step(b.run, b.rollback);
				throw new Error("late");
			});

			expect(await errorOf(result)).toHaveProperty("message", "late");
			expect(journal).toEqual(["run a", "run b", "rollback b", "rollback a"]);
		});

		it("does not roll back when the body catches the error of a step", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = await transaction(harness.ctx(), async (step) => {
				const a = named(journal, "a");
				const broken = failing(journal);
				await step(a.run, a.rollback);
				try {
					await step(broken.run, broken.rollback);
				} catch {
					return "recovered";
				}

				return "clean";
			});

			expect(result).toBe("recovered");
			expect(journal).toEqual(["run a", "run failing"]);
		});

		it("rolls back a finished step and one that ignored the signal after an abort", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];
			const gate = deferred<string>();

			const result = transaction(ctx, async (step) => {
				const a = named(journal, "a");
				await step(a.run, a.rollback);
				await step(
					() => gate.promise,
					(value) => {
						journal.push(`rollback ${value}`);
					},
				);
			});
			await vi.advanceTimersByTimeAsync(0);
			ctx.abort();
			await vi.advanceTimersByTimeAsync(0);
			gate.resolve("deaf");

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(journal).toEqual(["run a", "rollback deaf", "rollback a"]);
		});

		it("rejects with an AggregateError that holds the step error first when a rollback fails", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const result = transaction(harness.ctx(), async (step) => {
				const a = named(journal, "a");
				const broken = failing(journal);
				await step(a.run, () => {
					throw new Error("cannot undo");
				});
				await step(broken.run, broken.rollback);
			});

			const error = await errorOf(result);
			expect(error).toBeInstanceOf(AggregateError);
			const [first, second] = (error as AggregateError).errors;
			expect(first).toHaveProperty("message", "boom");
			expect(second).toHaveProperty("message", "cannot undo");
		});

		it("keeps the result pending until a slow rollback has finished", async () => {
			const harness = createHarness();
			const settled: string[] = [];

			const result = transaction(harness.ctx(), async (step) => {
				await step(
					async () => "a",
					async () => {
						await new Promise((resolve) => setTimeout(resolve, 100));
					},
				);
				throw new Error("body failed");
			});
			result.catch(() => {
				settled.push("rejected");
			});

			await vi.advanceTimersByTimeAsync(99);
			expect(settled).toEqual([]);
			await vi.advanceTimersByTimeAsync(1);
			expect(settled).toEqual(["rejected"]);
			expect(await errorOf(result)).toHaveProperty("message", "body failed");
		});

		it("rolls back and rejects with the abort reason when the body ignores the abort and returns", async () => {
			const harness = createHarness();
			const ctx = harness.ctx();
			const journal: Journal = [];
			const gate = deferred<string>();

			const result = transaction(ctx, async (step) => {
				const a = named(journal, "a");
				await step(a.run, a.rollback);
				await gate.promise;

				return "returned";
			});
			await vi.advanceTimersByTimeAsync(0);
			ctx.abort();
			gate.resolve("late");

			expect(await errorOf(result)).toBe(ctx.signal.reason);
			expect(journal).toEqual(["run a", "rollback a"]);
		});

		it("makes the same calls and the same error as the array form", async () => {
			const harness = createHarness();
			const arrayJournal: Journal = [];
			const scopeJournal: Journal = [];
			const options = { rollbackOrder: "reverse" } as const;

			const arrayResult = transaction(
				harness.ctx(),
				[
					stepNamed(arrayJournal, "a"),
					stepNamed(arrayJournal, "b"),
					failing(arrayJournal),
				],
				options,
			);
			const scopeResult = transaction(
				harness.ctx(),
				async (step) => {
					const a = named(scopeJournal, "a");
					const b = named(scopeJournal, "b");
					const broken = failing(scopeJournal);
					await step(a.run, a.rollback);
					await step(b.run, b.rollback);
					await step(broken.run, broken.rollback);
				},
				options,
			);

			const arrayError = await errorOf(arrayResult);
			const scopeError = await errorOf(scopeResult);
			expect(scopeJournal).toEqual(arrayJournal);
			expect(scopeError).toEqual(arrayError);
		});

		describe("step after an abort or after the end", () => {
			it("throws the abort reason and does not call run when the task is aborted", async () => {
				const harness = createHarness();
				const ctx = harness.ctx();
				const run = vi.fn(async () => 1);
				let stepError: unknown;

				const result = transaction(ctx, async (step) => {
					ctx.abort();
					try {
						await step(run);
					} catch (error) {
						stepError = error;
						throw error;
					}
				});

				expect(await errorOf(result)).toBe(ctx.signal.reason);
				expect(stepError).toBe(ctx.signal.reason);
				expect(run).not.toHaveBeenCalled();
			});

			it("throws a TypeError and does not call run for a step that is called after the end", async () => {
				const harness = createHarness();
				const run = vi.fn(async () => 1);
				let kept: ((run: () => Promise<number>) => Promise<number>) | undefined;

				await transaction(harness.ctx(), async (step) => {
					kept = step;
				});

				expect(await errorOf(kept?.(run) ?? Promise.resolve())).toBeInstanceOf(
					TypeError,
				);
				expect(run).not.toHaveBeenCalled();
			});
		});

		describe("steps that run at the same time", () => {
			// B finishes before A: both started together, then the body throws
			const together = async (
				journal: Journal,
				options: { rollbackOrder: "reverse" | "parallel" },
			) => {
				const harness = createHarness();
				const slow = deferred<string>();
				const result = transaction(
					harness.ctx(),
					async (step) => {
						const a = step(
							() => slow.promise,
							(value) => {
								journal.push(`rollback ${value}`);
							},
						);
						const b = step(
							async () => "b",
							(value) => {
								journal.push(`rollback ${value}`);
							},
						);
						await b;
						slow.resolve("a");
						await a;
						throw new Error("after both");
					},
					options,
				);
				await expect(result).rejects.toThrow("after both");
			};

			it("rolls back in the order they finished, last finished first", async () => {
				const journal: Journal = [];

				await together(journal, { rollbackOrder: "reverse" });

				expect(journal).toEqual(["rollback a", "rollback b"]);
			});

			it("calls all rollbacks with rollbackOrder parallel", async () => {
				const journal: Journal = [];

				await together(journal, { rollbackOrder: "parallel" });

				expect([...journal].sort()).toEqual(["rollback a", "rollback b"]);
			});
		});

		describe("options", () => {
			it("throws a RangeError for a wrong word of the transaction and does not call the body", () => {
				const harness = createHarness();
				const body = vi.fn(async () => 1);

				expect(() =>
					// @ts-expect-error not one of the three words
					transaction(harness.ctx(), body, { rollbackOn: "eror" }),
				).toThrow(RangeError);
				expect(body).not.toHaveBeenCalled();
			});

			it("throws a RangeError for a wrong word of a step before its run, and rolls back the earlier steps", async () => {
				const harness = createHarness();
				const journal: Journal = [];
				const run = vi.fn(async () => 3);

				const result = transaction(harness.ctx(), async (step) => {
					const a = named(journal, "a");
					const b = named(journal, "b");
					await step(a.run, a.rollback);
					await step(b.run, b.rollback);
					// @ts-expect-error not one of the three words
					await step(run, null, { rollbackOn: "eror" });
				});

				expect(await errorOf(result)).toBeInstanceOf(RangeError);
				expect(run).not.toHaveBeenCalled();
				expect(journal).toEqual(["run a", "run b", "rollback b", "rollback a"]);
			});

			it("lets the options of a step win over the options of the transaction", async () => {
				const harness = createHarness();
				const ctx = harness.ctx();
				const journal: Journal = [];

				const result = transaction(
					ctx,
					async (step) => {
						const a = named(journal, "a");
						const b = named(journal, "b");
						await step(a.run, a.rollback);
						await step(b.run, b.rollback, { rollbackOn: "both" });
						ctx.abort();
						throw ctx.signal.reason;
					},
					{ rollbackOn: "error" },
				);

				await errorOf(result);
				expect(journal).toEqual(["run a", "run b", "rollback b"]);
			});

			it("falls back to the transaction for a null option", async () => {
				const harness = createHarness();
				const ctx = harness.ctx();
				const journal: Journal = [];

				const result = transaction(
					ctx,
					async (step) => {
						const a = named(journal, "a");
						await step(a.run, a.rollback, { rollbackOn: null });
						ctx.abort();
						throw ctx.signal.reason;
					},
					{ rollbackOn: "abort" },
				);

				await errorOf(result);
				expect(journal).toEqual(["run a", "rollback a"]);
			});

			it("stops the rollbacks that are left after a failed one when the step says stop", async () => {
				const harness = createHarness();
				const journal: Journal = [];

				const result = transaction(harness.ctx(), async (step) => {
					const a = named(journal, "a");
					await step(a.run, a.rollback);
					await step(
						async () => "b",
						() => {
							throw new Error("cannot undo b");
						},
						{ rollbackFailure: "stop" },
					);
					throw new Error("late");
				});

				await errorOf(result);
				expect(journal).toEqual(["run a"]);
			});

			it("throws a TypeError for stop with rollbackOrder parallel, in the transaction and in a step", async () => {
				const harness = createHarness();
				const body = vi.fn(async () => 1);

				expect(() =>
					transaction(harness.ctx(), body, {
						rollbackFailure: "stop",
						rollbackOrder: "parallel",
					}),
				).toThrow(TypeError);
				expect(body).not.toHaveBeenCalled();

				const result = transaction(
					harness.ctx(),
					async (step) => {
						await step(async () => 1, null, { rollbackFailure: "stop" });
					},
					{ rollbackOrder: "parallel" },
				);
				expect(await errorOf(result)).toBeInstanceOf(TypeError);
			});
		});

		describe("listeners", () => {
			const listenersOf = (signal: AbortSignal) =>
				getEventListeners(signal, "abort").length;

			it("leaves no listener on the parent signal after it succeeds, fails, is aborted or a rollback fails", async () => {
				const harness = createHarness();
				const parent = harness.ctx();
				// the shared onAbort hub keeps its one real listener once a signal has been used
				await transaction(parent, async () => 0);
				const before = listenersOf(parent.signal);

				await transaction(parent, async (step) => {
					await step(async () => 1);
				});
				expect(listenersOf(parent.signal)).toBe(before);

				await errorOf(
					transaction(parent, async (step) => {
						await step(
							async () => 1,
							() => {},
						);
						throw new Error("body failed");
					}),
				);
				expect(listenersOf(parent.signal)).toBe(before);

				await errorOf(
					transaction(parent, async (step) => {
						await step(
							async () => 1,
							() => {
								throw new Error("cannot undo");
							},
						);
						throw new Error("body failed");
					}),
				);
				expect(listenersOf(parent.signal)).toBe(before);

				const aborted = transaction(parent, async (step) => {
					await step(hangUntilAbort);
				});
				await vi.advanceTimersByTimeAsync(0);
				parent.abort();
				await errorOf(aborted);
				// an aborted signal fires and drops its listeners: none may be left over from the transaction
				expect(listenersOf(parent.signal)).toBeLessThanOrEqual(before);
			});
		});
	});

	describe("scope form call forms", () => {
		it("takes a function first as a starter, with and without options", async () => {
			const harness = createHarness();
			const journal: Journal = [];

			const results = await all(harness.ctx(), {
				plain: transaction(async () => "plain"),
				limited: transaction(
					async (step) => {
						const a = stepNamed(journal, "a");

						return step(a.run, a.rollback);
					},
					{ rollbackOrder: "parallel" },
				),
			});

			expect(results).toEqual({ plain: "plain", limited: "a" });
		});

		it("takes an object and then a function as the context form, {} included", async () => {
			const harness = createHarness();

			await expect(
				transaction(harness.ctx(), async () => "with context"),
			).resolves.toBe("with context");
			await expect(
				transaction({}, async (step) => step(async () => "empty context")),
			).resolves.toBe("empty context");
		});

		it("throws a TypeError for a second function and for a function among the steps", () => {
			const harness = createHarness();

			expect(() =>
				transaction(
					// @ts-expect-error the options are an object
					harness.ctx(),
					async () => 1,
					() => 2,
				),
			).toThrow(TypeError);
			expect(() =>
				// @ts-expect-error a step has a run, a function is not one
				transaction(harness.ctx(), { run: async () => 1 }, async () => 2),
			).toThrow(TypeError);
		});

		it("aborts the steps of a body and rolls back when a group aborts it", async () => {
			const harness = createHarness();
			const journal: Journal = [];
			const gate = deferred<void>();

			const result = all(harness.ctx(), {
				order: transaction(async (step) => {
					const a = stepNamed(journal, "a");
					await step(a.run, a.rollback);
					await step(hangUntilAbort);
				}),
				user: async () => {
					await gate.promise;
					throw new Error("user failed");
				},
			});
			await vi.advanceTimersByTimeAsync(0);
			gate.resolve();

			await expect(result).rejects.toThrow("user failed");
			await vi.advanceTimersByTimeAsync(0);
			expect(journal).toEqual(["run a", "rollback a"]);
		});

		it("is bound to the task by effectsPlugin and gives what the body returns", async () => {
			const bus = createBus<TestEvents>().use(effectsPlugin({ transaction }));
			const journal: Journal = [];
			const results: string[] = [];

			bus.on("t", async (_, ctx) => {
				const value = await ctx.transaction(async (step) => {
					const a = stepNamed(journal, "a");

					return step(a.run, a.rollback);
				});
				results.push(value);
			});
			bus.emit("t", 1);
			await vi.advanceTimersByTimeAsync(0);

			expect(results).toEqual(["a"]);
			expect(journal).toEqual(["run a"]);
		});
	});
});
