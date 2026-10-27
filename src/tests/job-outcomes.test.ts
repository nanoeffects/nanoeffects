// What a job sends with the policies of the library today: a policy wraps the
// handler inside the job, so the job knows nothing about it (see the change
// `job-lifecycle-outcomes`, "Policies are not known to the job").
import { describe, expect, it } from "vitest";
import { commandsPlugin, createJob } from "../actions";
import { createBus } from "../core/bus";
import { latest, leading } from "../policies";
import { deferred } from "./test-helpers";

type Events = Record<string, unknown>;

const names = ["pending", "success", "fail", "cancel"] as const;

const setup = () => {
	const bus = createBus<Events>();
	const commands = bus.use(commandsPlugin());
	const job = createJob<string, string>("user/load");
	const seen: string[] = [];
	for (const name of names) {
		bus.on(job[name], () => {
			seen.push(name);
		});
	}
	return { bus, commands, job, seen };
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

describe("job outcomes under a policy (a limit of today)", () => {
	it("leading: a dropped call still sends pending and closes with success(undefined)", async () => {
		const { bus, commands, job, seen } = setup();
		const gate = deferred<string>();
		const results: unknown[] = [];
		commands.handle(
			job,
			leading(() => gate.promise),
		);
		bus.on(job.success, (value) => {
			results.push(value);
		});

		const first = bus.emit(job("1"));
		const second = bus.emit(job("2"));
		gate.resolve("done");
		await Promise.all([first, second]);

		expect(seen.filter((name) => name === "pending")).toHaveLength(2);
		expect(results.sort()).toEqual(["done", void 0].sort());
	});

	it("latest: a replaced run closes with success(undefined) and no cancel", async () => {
		const { bus, commands, job, seen } = setup();
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
		expect(seen).toEqual(["pending", "pending", "success"]);

		gates[1]?.resolve("done");
		await second;
		expect(seen).toEqual(["pending", "pending", "success", "success"]);
		expect(seen).not.toContain("cancel");
	});
});
