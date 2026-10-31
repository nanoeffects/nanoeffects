// What a job sends with the policies of the library: a policy wraps the handler
// inside the job and tells it when a call starts, is dropped, or is cancelled
// (see the change `policy-outcomes`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionsPlugin, createJob } from "../actions";
import { createBus } from "../core/bus";
import { debounce, latest, leading, queue, throttle } from "../policies";
import { deferred } from "./test-helpers";

type Events = Record<string, unknown>;

const names = ["pending", "success", "fail", "cancel"] as const;

// a job whose outcomes are recorded in order, with a counter and a flag of loading
const setup = () => {
	const bus = createBus<Events>();
	const commands = bus.use(actionsPlugin());
	const job = createJob<string, string | undefined>("user/load");
	const seen: string[] = [];
	const state = { running: 0, loading: false };
	for (const name of names) {
		bus.on(job[name], () => {
			seen.push(name);
			state.running += name === "pending" ? 1 : -1;
			state.loading = name === "pending";
		});
	}
	return { bus, commands, job, seen, state };
};

describe("job outcomes with a bound handler", () => {
	it("sends pending and then the closing outcome for a handler bound with commands.handle", async () => {
		const { bus, commands, job, seen } = setup();
		commands.handle(job, async (id) => id);

		await bus.emit(job("1"));

		expect(seen).toEqual(["pending", "success"]);
	});

	it("sends nothing for a job that has no handler", () => {
		const { bus, job, seen } = setup();

		expect(() => bus.emit(job("1"))).toThrow("No handler");
		expect(seen).toEqual([]);
	});
});

describe("job outcomes under a policy", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("leading: a dropped call sends nothing and does not clear the flag", async () => {
		const { bus, commands, job, seen, state } = setup();
		const gate = deferred<string>();
		commands.handle(
			job,
			leading(() => gate.promise),
		);

		const first = bus.emit(job("1"));
		const second = bus.emit(job("2"));
		await expect(second).resolves.toBeUndefined();

		expect(seen).toEqual(["pending"]);
		expect(state.loading).toBe(true);
		gate.resolve("done");
		await first;
		expect(seen).toEqual(["pending", "success"]);
		expect(state.running).toBe(0);
	});

	it("latest: a replaced run sends cancel before the next pending", async () => {
		const { bus, commands, job, seen, state } = setup();
		const gates = [deferred<string>(), deferred<string>()];
		let index = 0;
		commands.handle(
			job,
			latest(async (_id, { signal }) => {
				const gate = gates[index++];
				const aborted = new Promise<never>((_, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason));
				});
				return Promise.race([gate?.promise, aborted]);
			}),
		);

		const first = bus.emit(job("1"));
		const second = bus.emit(job("2"));
		await first;

		expect(seen).toEqual(["pending", "cancel", "pending"]);
		expect(state.loading).toBe(true);
		gates[1]?.resolve("done");
		await second;
		expect(seen).toEqual(["pending", "cancel", "pending", "success"]);
		expect(state.loading).toBe(false);
	});

	it("debounce: one pending, when the run starts, and none for a call that was replaced", async () => {
		const { bus, commands, job, seen } = setup();
		commands.handle(
			job,
			debounce(100, async (id: string) => id),
		);

		const first = bus.emit(job("1"));
		const second = bus.emit(job("2"));
		expect(seen).toEqual([]);
		await vi.advanceTimersByTimeAsync(100);
		await Promise.all([first, second]);

		expect(seen).toEqual(["pending", "success"]);
	});

	it("throttle: a held call that is replaced sends nothing", async () => {
		const { bus, commands, job, seen } = setup();
		commands.handle(
			job,
			throttle(100, (id: string) => id),
		);

		const calls = [bus.emit(job("1")), bus.emit(job("2")), bus.emit(job("3"))];
		await vi.advanceTimersByTimeAsync(100);
		await Promise.all(calls);

		// the first runs at once, the second is replaced by the third, which runs after the wait
		expect(seen).toEqual(["pending", "success", "pending", "success"]);
	});

	it("queue: pending is sent when the call's turn comes", async () => {
		const { bus, commands, job, seen, state } = setup();
		const gate = deferred<string>();
		const gates = [gate, deferred<string>()];
		let index = 0;
		commands.handle(
			job,
			queue((_id: string) => gates[index++]?.promise ?? Promise.resolve("")),
		);

		const first = bus.emit(job("1"));
		const second = bus.emit(job("2"));
		expect(seen).toEqual(["pending"]);
		gates[0]?.resolve("a");
		await first;
		expect(seen).toEqual(["pending", "success", "pending"]);
		expect(state.loading).toBe(true);
		gates[1]?.resolve("b");
		await second;
		expect(seen).toEqual(["pending", "success", "pending", "success"]);
	});

	it("queue: a call that waits and is dropped by the limit sends nothing", async () => {
		const { bus, commands, job, seen } = setup();
		const gate = deferred<string>();
		commands.handle(
			job,
			queue((_id: string) => gate.promise, { limit: 0 }),
		);

		const first = bus.emit(job("1"));
		await expect(bus.emit(job("2"))).resolves.toBeUndefined();
		gate.resolve("a");
		await first;

		expect(seen).toEqual(["pending", "success"]);
	});

	it("a policy that is wrapped in a function the job cannot see sends pending at the call", async () => {
		const { bus, commands, job, seen } = setup();
		const gate = deferred<string>();
		const guarded = leading(() => gate.promise);
		commands.handle(job, (id, ctx) => guarded(id, ctx));

		const first = bus.emit(job("1"));
		const second = bus.emit(job("2"));
		gate.resolve("a");
		await Promise.all([first, second]);

		expect(seen.filter((name) => name === "pending")).toHaveLength(2);
	});

	it("a counter is exact under every policy", async () => {
		const { bus, commands, job, state } = setup();
		commands.handle(
			job,
			latest(async (id: string) => id),
		);

		await Promise.all([
			bus.emit(job("1")),
			bus.emit(job("2")),
			bus.emit(job("3")),
		]);

		expect(state.running).toBe(0);
	});
});
