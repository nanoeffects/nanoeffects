# Proposal

## Why

RxJS tests state time as a diagram: `TestScheduler` and marbles show when each value arrives and when it ends. A test of `latest`, `debounce`, `queue`, `retry` or `timeout` in nanoeffects uses fake timers and checks a list of calls or a recorder by hand, so the shape of time is hidden in `advanceTimersByTime` numbers. This is the largest gap left against RxJS in testing. A small diagram helper closes it without a scheduler of our own: the bus already traces every task phase, and fake timers already move time.

## What Changes

- A new optional entry `nanoeffects/testing` with `createMarbleBus` and `fakeTimersClock`. It does not import vitest or jest.
- `createMarbleBus({ clock, frame? })` returns a bus that records its trace (`tracePlugin` is on) and a `run` method. A test registers its listeners on that bus, then calls `run` with the emits as diagrams: `"a-b-------"`, each letter mapped to a value.
- `run` advances the clock one frame at a time (default 10 ms), emits what the diagram says at each frame, and returns the phases of the trace as diagrams too: `s` start, `d` done, `e` error, `c` cancel, `x` drop, `-` nothing, `(sd)` several in one frame. `result.expect({ "latest": "s-c-d" })` throws with the two diagrams one under the other when they differ.
- `fakeTimersClock(vi)` (or `jest`) is the adapter for fake timers; any object with `advance(ms)` and `now()` is a clock.
- Docs: `docs/testing.md` (English and Russian), a line in `docs/recipes.md`, the entry in `docs/package.md`, sidebar, `llms.txt`, a type-checked example, `CHANGELOG.md`.

Not in this change: the rest of the RxJS alphabet (`^`, `!`, hot and cold observables), a diagram for payloads, a test runner or matchers, `createHarness` becoming public, and a `notrace` build of the entry (it needs the tracer).

## Capabilities

### New Capabilities
- `marble-testing`: the helper, the alphabet, the frame and the failure message.
- `docs-testing`: the docs page and the places that list it.

### Modified Capabilities

None.

## Impact

- New `src/testing/`, an entry in `tsdown.config.ts`, `package.json` (`exports`, `size-limit`), `src/tests/exports.test.ts`, `docs/`, `docs/ru/`, `tools/docs-site/.vitepress/sidebar.ts`, `llms.txt`, `examples/testing/`, `CHANGELOG.md`.
- `createBus` and `src/core` do not change. The entry imports `createBus`, `createTracer`, `createTraceRecorder` and `tracePlugin` as a user would.
