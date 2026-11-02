# Spec Delta

## Purpose
Lets a test state when events are emitted and when tasks start, finish, fail, stop or are dropped as two short diagrams on fake timers, so time is visible in the test and a failure shows both diagrams.

## ADDED Requirements

### Requirement: createMarbleBus returns a traced bus and a runner
`createMarbleBus({ clock, frame })` from `nanoeffects/testing` SHALL return `{ bus, run }`. `bus` SHALL be a bus with a tracer that records every event and with `tracePlugin` used, and SHALL accept the other options of `createBus`. `frame` is the length of a frame in milliseconds and SHALL default to 10. `clock` SHALL be an object `{ advance(ms), now() }`, where `advance` may return a promise. The module SHALL NOT import a test runner.

#### Scenario: The bus is traced
- **WHEN** a listener is registered on `bus` and an event is emitted
- **THEN** the trace of the run holds the events of the tasks, including a listener named by its function name

### Requirement: Emits are written as a diagram
`run({ emits, frames })` SHALL take `emits` as an object whose keys are event names and whose values are `{ marble, values }`. In `marble`, `-` is a frame with no emit; any other character except `(`, `)`, `|` and whitespace emits the event at that frame with `values[character]`, or the character itself when `values` has no such key; `(ab)` emits `a` then `b` in one frame. Any other use of `|`, `(`, `)` or whitespace SHALL throw an error that names the diagram and the position. `frames` is the number of frames to run and SHALL default to the length of the longest diagram.

#### Scenario: Two emits
- **WHEN** `"a-b---"` is given with `values: { a: "x", b: "xy" }` for `search/changed`
- **THEN** the bus gets `emit("search/changed", "x")` at frame 0 and `emit("search/changed", "xy")` at frame 2

#### Scenario: A group
- **WHEN** the diagram is `"(ab)-"`
- **THEN** both events are emitted at frame 0, `a` first

#### Scenario: A bad character
- **WHEN** the diagram contains `|`
- **THEN** `run` throws before emitting anything

### Requirement: Time moves one frame at a time
For each frame `i`, `run` SHALL emit what the diagrams say for `i`, and then call `clock.advance(frame)` and wait for it, so the timers and the pending promises of that frame have run. The frame of a trace event SHALL be `Math.floor((clock.now() - start) / frame)` at the moment the event is recorded, where `start` is `clock.now()` when `run` began. An event after the last frame SHALL NOT be shown.

#### Scenario: A timer at the edge of a frame
- **WHEN** a listener waits 100 ms with `frame: 10` and the event is emitted at frame 0
- **THEN** its `done` is in frame 10

### Requirement: The trace is read as rows of phases
`result.rows()` SHALL return an object whose keys are `type:effect` of the tasks that were traced (for example `search:run`, `search:queue`, `search/changed:latest`) and whose values are diagrams of the phases of those tasks: `s` for `start`, `d` for `done`, `e` for `error`, `c` for `cancel`, `x` for `drop`, `-` for a frame with none, and `(…)` for several in one frame, in the order they were recorded. Every diagram SHALL have one character or group for each frame run. The `emit` effect SHALL NOT be a row.

#### Scenario: latest
- **WHEN** a handler named `search` behind `latest` takes 50 ms, is emitted at frames 0 and 1, and `frames` is 10
- **THEN** the row `search/changed:latest` shows a `c` at the frame of the second emit and a `d` for the second call

### Requirement: expect compares diagrams and fails with both
`result.expect(rows)` SHALL compare each given row with the diagram of the run. A key without `:` SHALL match every row whose effect is that key and, for the row to compare, its diagram SHALL be the one with the first match; a key with `:` SHALL match that row exactly. A diagram shorter than `frames` SHALL be padded with `-`. When a row differs or does not exist, `expect` SHALL throw an `Error` whose message holds the key and the two diagrams one under the other, marked `expected` and `received`; when all rows match it SHALL return the result.

#### Scenario: A difference
- **WHEN** `expect({ "search:run": "s---d" })` is called and the run has `s--d-`
- **THEN** the error message shows `expected  s---d` and `received  s--d-` under the key `search:run`

#### Scenario: A missing row
- **WHEN** a key matches no task
- **THEN** the error says so and lists the rows that exist

### Requirement: The clock adapter works with fake timers
`fakeTimersClock(runner)` SHALL return `{ advance, now }` where `advance(ms)` calls `runner.advanceTimersByTimeAsync(ms)` and `now()` returns `Date.now()`. It SHALL work with `vi` of Vitest and `jest` of Jest, when the test turned on fake timers and left `Date` faked.

#### Scenario: Vitest
- **WHEN** a test calls `vi.useFakeTimers()` and `createMarbleBus({ clock: fakeTimersClock(vi) })`
- **THEN** a 100 ms timer in a listener fires when the run reaches frame 10

### Requirement: Policies are tested by diagrams
The helper SHALL work with the policies and effects of the library, and its own tests SHALL cover `latest`, `debounce`, `throttle`, `queue`, `retry` and `timeout` with diagrams.

#### Scenario: Queue
- **WHEN** two calls reach a `queue` listener that takes 30 ms
- **THEN** the diagram of its row shows the second `s` after the first `d`
