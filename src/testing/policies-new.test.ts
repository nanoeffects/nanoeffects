import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { batch, dedupe, distinct, latest, queue, rateLimit } from "../policies";
import { fakeTimersClock } from "./clock";
import { createMarbleBus } from "./runner";

// The tests of dedupe, distinct, rateLimit and batch, written as diagrams: one frame is 10 ms.
// `x:run` is the call as the bus runs it, `x:policy` is what the policy reports for it:
// `s` start, `d` done, `e` error, `c` cancel, `x` drop.

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

describe("the newer policies, as diagrams", () => {
	it("dedupe: a call that comes while one runs shares it, and one after it starts again", async () => {
		const marbles = setup();
		async function load(_id: unknown) {
			await wait(50);
		}
		marbles.bus.on("s", dedupe(load), { traceId: "load" });

		const result = await marbles.run({
			emits: { s: { marble: "ab----c", values: { a: 1, b: 1, c: 1 } } },
			frames: 14,
		});

		// the second call is dropped as a call (`x`) and ends with the shared run (`d`)
		result.expect({
			"load:run": "ss---(dd)s----d--",
			"load:dedupe": "s----(dx)s----d--",
		});
	});

	it("dedupe: calls with different payloads each run", async () => {
		const marbles = setup();
		async function load(_id: unknown) {
			await wait(50);
		}
		marbles.bus.on("s", dedupe(load), { traceId: "load" });

		const result = await marbles.run({
			emits: { s: { marble: "ab", values: { a: 1, b: 2 } } },
			frames: 10,
		});

		result.expect({
			"load:run": "ss---dd---",
			"load:dedupe": "ss---dd---",
		});
	});

	it("distinct: a repeated payload is dropped, a changed one runs", async () => {
		const marbles = setup();
		async function save(_draft: unknown) {
			await wait(20);
		}
		marbles.bus.on("s", distinct(save), { traceId: "save" });

		const result = await marbles.run({
			emits: { s: { marble: "a-b-c-d", values: { a: 1, b: 1, c: 2, d: 2 } } },
			frames: 12,
		});

		result.expect({
			"save:run": "s-(dsd)-s-(dsd)-----",
			"save:distinct": "s-(dx)-s-(dx)-----",
		});
	});

	it("rateLimit: two runs start at once, the others wait for the window to slide", async () => {
		const marbles = setup();
		async function call(_request: unknown) {
			await wait(10);
		}
		marbles.bus.on("s", rateLimit(2, 50, call), { traceId: "api" });

		const result = await marbles.run({
			emits: { s: { marble: "aaaa" } },
			frames: 14,
		});

		// the third call starts at 50 ms, when the first start leaves the window, the fourth at 60 ms
		result.expect({
			"api:run": "s(ds)(ds)s--dd------",
			"api:rateLimit": "s(ds)d--s(ds)d------",
		});
	});

	it("rateLimit with overflow drop: a call over the limit is dropped, a later one runs", async () => {
		const marbles = setup();
		async function call(_request: unknown) {
			await wait(10);
		}
		marbles.bus.on("s", rateLimit(1, 50, call, { overflow: "drop" }), {
			traceId: "api",
		});

		const result = await marbles.run({
			emits: { s: { marble: "aaa---a" } },
			frames: 14,
		});

		result.expect({
			"api:run": "s(dsd)(sd)---sd------",
			"api:rateLimit": "s(dx)x---sd------",
		});
	});

	it("batch: the calls of a window go in one run, the later ones in the next window", async () => {
		const marbles = setup();
		async function send(_events: unknown[]) {
			await wait(10);
		}
		marbles.bus.on("s", batch(30, send), { traceId: "send" });

		const result = await marbles.run({
			emits: { s: { marble: "ab--c-d" } },
			frames: 14,
		});

		// the window of the first call closes at 30 ms; the second call ends with the same run
		result.expect({
			"send:run": "ss--(dds)-s-(dd)-----",
			"send:batch": "---s(dx)--s(dx)-----",
		});
	});

	it("queue(dedupe): the queue runs one call at a time, so a repeat is not shared", async () => {
		const marbles = setup();
		async function load(_id: unknown) {
			await wait(30);
		}
		marbles.bus.on("s", queue(dedupe(load)), { traceId: "q" });

		const result = await marbles.run({
			emits: { s: { marble: "aab" } },
			frames: 14,
		});

		result.expect({
			"q:run": "sssd--d--d----",
			"q:queue": "s--(ds)--(ds)--d----",
			"q:dedupe": "s--(ds)--(ds)--d----",
		});
	});

	it("latest(rateLimit): the newer call waits for the window and the older one is already done", async () => {
		const marbles = setup();
		async function call(_request: unknown) {
			await wait(10);
		}
		marbles.bus.on("s", latest(rateLimit(1, 50, call)), { traceId: "l" });

		const result = await marbles.run({
			emits: { s: { marble: "ab" } },
			frames: 14,
		});

		result.expect({
			"s:latest": "s(ds)----d-------",
			"s:rateLimit": "sd---sd-------",
		});
	});
});
