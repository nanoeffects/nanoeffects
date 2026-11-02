// Tests of three policies, written as diagrams. One frame is 10 ms.
// The docs: docs/testing.md. Run it with: pnpm vitest run examples/testing

import { debounce, latest, queue } from "nanoeffects/policies";
import { createMarbleBus, fakeTimersClock } from "nanoeffects/testing";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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

// a search that takes 50 ms
async function search(_query: unknown) {
	await wait(50);
}

// a lookup that takes 5 ms
async function lookup(_query: unknown) {
	await wait(5);
}

it("latest: a new search cancels the one that is running", async () => {
	// createMarbleBus: a bus that records its trace, and a run that moves time by frames
	const marbles = createMarbleBus({ clock: fakeTimersClock(vi) });
	marbles.bus.on("search/changed", latest(search), { traceId: "search" });

	const result = await marbles.run({
		emits: { "search/changed": { marble: "a-b" } },
		frames: 12,
	});

	// s start, c cancel, d done
	result.expect({ "search/changed:latest": "s-(cs)----d----" });
});

it("queue: the second search starts when the first one is done", async () => {
	const marbles = createMarbleBus({ clock: fakeTimersClock(vi) });
	marbles.bus.on("search/changed", queue(search), { traceId: "search" });

	const result = await marbles.run({
		emits: { "search/changed": { marble: "a-b" } },
		frames: 12,
	});

	result.expect({ "search:queue": "s----(ds)----d-" });
});

it("debounce: only the last key of a burst is searched", async () => {
	const marbles = createMarbleBus({ clock: fakeTimersClock(vi) });
	marbles.bus.on("search/changed", debounce(30, lookup), {
		traceId: "search",
	});

	const result = await marbles.run({
		emits: { "search/changed": { marble: "ab--c" } },
		frames: 12,
	});

	// x drop: the first key is replaced at once
	result.expect({ "search/changed:debounce": "-x--(sc)--(sd)----" });
});

it("the diagram of a failure shows both rows", async () => {
	const marbles = createMarbleBus({ clock: fakeTimersClock(vi) });
	marbles.bus.on("search/changed", latest(search), { traceId: "search" });

	const result = await marbles.run({
		emits: { "search/changed": { marble: "a-b" } },
		frames: 12,
	});

	expect(() => result.expect({ latest: "s-(cs)---d-----" })).toThrow(
		"expected  s-(cs)---d-----",
	);
});
