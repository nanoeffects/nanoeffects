## ADDED Requirements

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
