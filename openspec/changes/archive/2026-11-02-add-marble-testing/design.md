# Design

## Context

Tests of time use `createHarness` (internal: a bus that records its trace) and Vitest fake timers. What I observed in the trace of a named listener `search` with the policies on (a probe of the current code):

- `latest`: the policy has its own task, `type` is the event (`s`), `effect: "latest"`, phases `start`, `cancel` or `done`. The listener has `search · run`.
- `queue`: the policy task is named after the listener (`search · queue`), next to `search · run`.
- Every emit is `effect: "emit"`, phase `done`.

So a row of the trace is best identified by the pair of `type` and `effect`, not by `type` alone: the same listener shows in two effects.

## Goals / Non-Goals

**Goals:**
- A test states emits and phases as short diagrams and fails with both diagrams.
- No dependency on a test runner; an adapter for fake timers.
- Minimal alphabet, one clear rule for time.

**Non-Goals:**
- The RxJS alphabet (`^`, `!`, `#`, hot/cold), payload diagrams, matchers, a scheduler of our own, a public `createHarness`.

## Decisions

- **Own entry `nanoeffects/testing`**, not the trace entry: it is for tests only and must not weigh on `trace`. It has no `notrace` build (the tracer is the point) and its own `size-limit`. Alternative: put it in `trace`; rejected, it would add bytes to every user of the loggers.
- **The helper owns the bus.** `createMarbleBus` builds `createBus({ trace: createTracer(recorder), ...options }).use(tracePlugin())`, because it must be the one that holds the recorder. A user who needs plugins calls `marbles.bus.use(...)`. Alternative: take a ready bus and wrap its tracer; rejected, there is no way to add a logger to an existing tracer without changing core.
- **Time model: frame = `floor((now - start) / frame)` of the recorded moment, with `now` from the clock.** The runner emits at the start of frame `i` (virtual time `i * frame`), then `advance(frame)`. A timer at 100 ms with 10 ms frames is in frame 10, which makes `s---------d` read like the numbers in the code. Alternative: attribute events by the frame during whose `advance` they ran (ceil); rejected, a microtask continuation of an emit would be stamped one frame late. The adapter reads `Date.now()`, so a test that fakes timers but not `Date` must give its own clock; this is in the docs.
- **Between frames: only `await clock.advance(frame)`.** `advanceTimersByTimeAsync` runs the timers and the microtasks between them, so a chain of awaits finishes inside its frame. Nothing else is flushed. A handler that waits for something outside the clock (a real socket) is not a use of this helper.
- **Alphabet.** Emits: `-` idle, any other character but `( ) |` and whitespace is an emit of `values[c] ?? c`, `(ab)` groups in one frame. Phases: `s d e c x -` and `(…)` groups. `|` is rejected in v1 so that it can get a meaning later (end of input) without breaking a diagram.
- **Rows are `type:effect`, `expect` also takes the effect alone.** The key `latest` means "the row whose effect is `latest`"; if two rows have that effect the error asks for the full key. `rows()` lists all, which is how a test author finds the key. The `emit` effect is not a row: an emit is already in the input diagram.
- **Failure is a thrown `Error`** with the key and two aligned diagrams (`expected  …` / `received  …`). A test runner prints it; no matcher library is needed. `rows()` is a plain object, so `expect(result.rows()).toEqual(...)` works too.
- **`frames` default is the longest emit diagram.** A handler that outlives it is cut off; the docs tell the author to set `frames`. Draining all timers is not a default because a polling handler never ends.
- **Core is untouched.** Everything is built from the public `createBus`, `createTracer`, `createTraceRecorder` and `tracePlugin`.

## Risks / Trade-offs

- The row keys depend on the effect names of the policies (`latest`, `queue`, ...). These are part of the trace contract already, but a rename would break tests written with them. The spec fixes them through the policy tests of this change.
- Phases of several tasks with the same key in one frame (two runs of `search:run`) share one row, so `(sd)` is the order they were recorded, not which call they belong to. Per-call rows are left for later.
- Reading `Date.now()` ties the adapter to faked `Date`. A custom clock is the escape.
- A new entry is new surface. It is kept to two functions and one result type, and it is the answer to the largest testing gap; the owner asked for it.
