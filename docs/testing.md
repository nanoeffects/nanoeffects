# Test time with diagrams

> **Level B.** Read first: [Policies](policies.md).

A test of `latest`, `debounce`, `queue`, `retry` or `timeout` is a test of time. With fake timers the time hides in numbers (`advanceTimersByTime(30)`), and you check a list of calls by hand. This page shows how to write the schedule and the expectation as two short diagrams, as RxJS marble tests do.

You need a test runner with fake timers (Vitest or Jest). The helper does not import one.

## Test a policy with a diagram

**Problem.** You want a test that says: a second search cancels the first one, and only the second finishes.

**When.** A policy or an effect decides what runs when, and the answer depends on the time between events.

1. Create a bus with `createMarbleBus`. It records the trace of its tasks and gives you `run`.
2. Register the handler on `marbles.bus`, as you do in your app.
3. Call `run` with a diagram of the emits. One character is one frame (10 ms by default).
4. Call `expect` with a diagram of the phases that you expect.

```js
// search.test.js
import { it, vi } from "vitest";
import { latest } from "nanoeffects/policies";
import { createMarbleBus, fakeTimersClock } from "nanoeffects/testing";

// a search that takes 50 ms
function search(query) {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

it("latest cancels the search that is running", async () => {
  vi.useFakeTimers();

  // createMarbleBus: a bus that records its trace, and a run that moves time frame by frame
  const marbles = createMarbleBus({ clock: fakeTimersClock(vi) });

  // latest: a new search cancels the one that is running
  marbles.bus.on("search/changed", latest(search), { traceId: "search" });

  // "a-b": emit "x" at frame 0 and "xy" at frame 2
  const result = await marbles.run({
    emits: { "search/changed": { marble: "a-b", values: { a: "x", b: "xy" } } },
    frames: 12,
  });

  // s start, c cancel, d done: at frame 2 the second search cancels the first, and it is done at frame 7
  result.expect({ "search/changed:latest": "s-(cs)----d----" });
});
```

When a row differs, `expect` throws an error with both diagrams one under the other:

```
marble row "search/changed:latest" differs
  expected  s-(cs)----d----
  received  s-(cs)---d-----
```

The same test for `queue` and `debounce` is in [`examples/testing`](../examples/testing). Run it with `pnpm vitest run examples/testing`.

## Read the diagrams

A diagram has one character, or one group in parentheses, for each frame.

| Character | In `emits` | In the result |
| --------- | ---------- | ------------- |
| `-` | nothing happens | nothing happens |
| a letter or digit | emits the event with `values[character]` (the character itself without `values`) | `s` start, `d` done, `e` error, `c` cancel, `x` drop |
| `(ab)` | two emits in one frame, in this order | two phases in one frame, in the order they happened |

Other characters (`|`, spaces) throw an error that names the diagram and the position.

A task has a row in the result named `type:effect`: `search/changed:latest` is the task of the `latest` policy, `search:run` is the listener named `search`. Call `result.rows()` to print every row, then copy the ones you want into `expect`. In `expect` you can write the effect alone (`latest`) when one row has it. If two rows have it, the error asks for the full key.

## Set the frame and the number of frames

A frame is 10 ms. Pass `frame` to `createMarbleBus` to change it. The frame of an event is its time divided by the frame, rounded down: a timer of 100 ms that starts at frame 0 ends in frame 10, so `frames` must be 11 or more to show it.

`frames` is the number of frames to run. Without it the helper runs as many as the longest `emits` diagram has. Work that outlives the diagram is cut, so set `frames` when a handler takes time.

## Use another clock

`fakeTimersClock(vi)` moves fake timers and reads `Date.now()`. A test turns fake timers on itself (`vi.useFakeTimers()`) and leaves `Date` faked, which is the default. Jest works the same way: `fakeTimersClock(jest)`.

Any object with `advance(ms)` and `now()` is a clock. `advance` may return a promise.

## Know what is not there

- **It needs a tracer.** The helper reads the trace of the bus, so there is no `notrace` build of `nanoeffects/testing`.
- **One row for all calls.** Two calls of one listener share a row, so `(sd)` shows the order in which phases happened, not which call they belong to.
- **No payloads in diagrams.** The diagram shows when, not what. Check the values with your test runner as usual.
- **Not the RxJS alphabet.** There are no hot or cold sources and no `|` for the end of a stream.
