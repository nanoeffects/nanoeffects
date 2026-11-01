# trace-types Specification

## Purpose
Lets a person who writes a logger or a tracer import the types of tracing from the same entry as `createTracer` and the loggers, `nanoeffects/trace`, and nowhere else. The definitions stay in the core, which the bus needs.

## Requirements

### Requirement: The trace entry exports the types of tracing
`nanoeffects/trace` SHALL export the types `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase` and `EffectName`. They SHALL be the types the core defines, so a value of one is a value of the other, and a logger made for `createTracer` SHALL be typed with them, including the type parameter of `Trace`, `TraceEvent` and `TraceLogger`.

#### Scenario: A logger is typed from the trace entry
- **WHEN** `const logger: TraceLogger = (event) => …` is written with `TraceLogger` imported from `nanoeffects/trace`, and it is passed to `createTracer`
- **THEN** it type checks, and `event.phase` is a `Phase`

#### Scenario: The type parameter is kept
- **WHEN** `TraceLogger<{ id: number }>` is written with the type imported from `nanoeffects/trace`
- **THEN** the payload of its event is typed by that parameter

#### Scenario: BusOptions takes a tracer of this type
- **WHEN** `createBus({ trace })` is called with the value of `createTracer(logger)`
- **THEN** it type checks

### Requirement: The root entry does not export the types of tracing
The root entry `nanoeffects` SHALL NOT export `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase` or `EffectName`.

#### Scenario: An import from the root is an error
- **WHEN** `import type { TraceLogger } from "nanoeffects"` is written
- **THEN** it is a type error, and the same type is imported from `nanoeffects/trace`

### Requirement: Exporting the types adds no code
The types of tracing SHALL be exported from the trace entry as types only. The runtime exports of `nanoeffects/trace`, and the size of its bundle, SHALL not change.

#### Scenario: The runtime exports are the same
- **WHEN** the runtime exports of `nanoeffects/trace` are listed before and after
- **THEN** the list is the same

### Requirement: The docs take the types from the trace entry
The pages and examples of the documentation SHALL import the types of tracing from `nanoeffects/trace`, next to `createTracer`.

#### Scenario: The logger example
- **WHEN** the custom logger example of the tracing page is read
- **THEN** it imports `TraceLogger` from `nanoeffects/trace`, and `pnpm docs:check` passes

### Requirement: A run of a handler of an action is reported with the effect "action"
When a bus with a tracer runs the handler of an action (its own or one bound in the registry), the trace events of that task SHALL have `effect: "action"`. `EffectName` SHALL include `"action"` and SHALL NOT include `"command"`.

#### Scenario: The effect of a run
- **WHEN** a bus with a tracer emits `getUser("1")` for an action made with a handler
- **THEN** the events of the task have `effect: "action"` with the phases `start` and `done`

#### Scenario: The old name is a type error
- **WHEN** code compares `event.effect === "command"`
- **THEN** it is a type error, because `"command"` is not an `EffectName`

### Requirement: A logger can watch tasks as they are made
A trace logger MAY have a `task` method. `createTracer` SHALL call it for every task of a sampled root when the task is made, also for a task that never reports an event (a plain handler), with `{ ref, parent, id, type, leaf, traceGroupId }`: `ref` is the opaque handle of the task, `parent` the handle of its parent (absent for a root), `id` the number the events of the task use, `type` the type it has now, `leaf` is `true` for the emit event that `tracePlugin` makes, and `emitted` is `false` for a task that `ctx.run`, an effect or a policy made inside a handler and `true` for the task of an emit. When a task is renamed (a listener named with `traceId`), `task` SHALL be called again for the same `ref` with the new `type` and `event`, the type it had before. A logger with no `task` method SHALL behave exactly as before, and a plain function SHALL still be a `TraceLogger`.

#### Scenario: A plain handler is seen
- **WHEN** a handler of `a` (no policy, no `traceId`) emits `b` with `ctx.emit` and a logger has `task`
- **THEN** `task` is called for the task of the handler of `a`, and again for the task of `b` with the first one as `parent`

#### Scenario: A rename
- **WHEN** `bus.on("total/changed", handler, { traceId: "syncCart" })` runs
- **THEN** `task` is called for that task with `type: "total/changed"` and then again with `type: "syncCart"` and `event: "total/changed"`

#### Scenario: An emit or a run
- **WHEN** a handler calls `ctx.emit("b")` and `ctx.run(fn)`
- **THEN** the task of the handler of `b` has `emitted: true` and the child made by `ctx.run` has `emitted: false`

#### Scenario: Leaf emits
- **WHEN** `tracePlugin` reports an emit
- **THEN** `task` is called for it with `leaf: true`

#### Scenario: Sampling
- **WHEN** a root is not sampled
- **THEN** `task` is not called for it or for any task below it

#### Scenario: A logger without the method
- **WHEN** a logger is a plain function
- **THEN** it receives the same events as before and nothing else

#### Scenario: A throwing hook
- **WHEN** `task` throws
- **THEN** the task goes on and the error is reported as for any failed logger
