import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { retry, timeout } from "../effects";
import { debounce, latest, leading, queue, throttle } from "../policies";
import { fakeTimersClock } from "./clock";
import { createMarbleBus } from "./runner";

// The tests of the policies, written as diagrams: one frame is 10 ms.

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

const wait = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const setup = () => createMarbleBus({ clock: fakeTimersClock(vi) });

// a search that takes 50 ms
async function search(_query: unknown) {
	await wait(50);
}

describe("policies, as diagrams", () => {
	it("latest: a new call cancels the one that is running", async () => {
		const marbles = setup();
		marbles.bus.on("s", latest(search), { traceId: "search" });

		const result = await marbles.run({
			emits: { s: { marble: "a-b" } },
			frames: 12,
		});

		result.expect({
			"s:latest": "s-(cs)----d----",
			"search:run": "s-s--d-d----",
		});
	});

	it("queue: the second call starts when the first one is done", async () => {
		const marbles = setup();
		marbles.bus.on("s", queue(search), { traceId: "search" });

		const result = await marbles.run({
			emits: { s: { marble: "a-b" } },
			frames: 12,
		});

		result.expect({
			"search:queue": "s----(ds)----d-",
			"search:run": "s-s--d----d-",
		});
	});

	it("leading: a call while one runs is dropped", async () => {
		const marbles = setup();
		marbles.bus.on("s", leading(search), { traceId: "search" });

		const result = await marbles.run({
			emits: { s: { marble: "a-b" } },
			frames: 12,
		});

		result.expect({ "search:leading": "s-x--d------" });
	});

	it("debounce: only the last of a burst runs, after the quiet time", async () => {
		const marbles = setup();
		async function quick(_query: unknown) {
			await wait(5);
		}
		marbles.bus.on("s", debounce(30, quick), { traceId: "search" });

		const result = await marbles.run({
			emits: { s: { marble: "ab--c" } },
			frames: 12,
		});

		result.expect({ "s:debounce": "-x--(sc)--(sd)----" });
	});

	it("throttle: calls inside the window wait for its end", async () => {
		const marbles = setup();
		async function quick(_query: unknown) {
			await wait(5);
		}
		marbles.bus.on("s", throttle(30, quick), { traceId: "search" });

		const result = await marbles.run({
			emits: { s: { marble: "ab--c" } },
			frames: 12,
		});

		result.expect({ "search:throttle": "(sd)--(sd)(sd)-------" });
	});

	it("retry: each failed try is an error, then a new start", async () => {
		const marbles = setup();
		let tries = 0;
		marbles.bus.on(
			"r",
			async (_payload, ctx) => {
				await retry(
					ctx,
					async () => {
						tries += 1;
						await wait(20);
						if (tries < 3) {
							throw new Error("try again");
						}
					},
					{ times: 3, delay: 10 },
				);
			},
			{ traceId: "job" },
		);

		const result = await marbles.run({
			emits: { r: { marble: "a" } },
			frames: 12,
		});

		result.expect({ "r:run": "s-es-es-d---", "r:retry": "s-------d---" });
	});

	it("timeout: a slow call is an error, and its work is cancelled", async () => {
		const marbles = setup();
		marbles.bus.on(
			"t",
			async (_payload, ctx) => {
				try {
					await timeout(ctx, 30, () => wait(100));
				} catch {
					// the timeout is what the diagram shows
				}
			},
			{ traceId: "slow" },
		);

		const result = await marbles.run({
			emits: { t: { marble: "a" } },
			frames: 12,
		});

		result.expect({ "t:timeout": "s--e--------", "t:run": "s--c--------" });
	});
});
