# effect-composition Specification

## Purpose
Let `retry`, `timeout` and `poll` be used as wrappers of a Task, so they compose with policies and with `ctx.run` without `ctx` in their arguments, while the `ctx`-first calls keep working.

## Requirements

### Requirement: Effects accept a Task and return a Task
`retry(task, options)`, `timeout(ms, task)` and `poll(ms, task, options)` SHALL return a Task, a function `(payload, ctx) => result`, that calls `task` with the payload it is given and a context of its own.

#### Scenario: A wrapped Task is a handler
- **WHEN** `bus.on("typed", retry(search, { times: 3 }))` is subscribed and `typed` is emitted with a payload
- **THEN** `search` is called with that payload and a task context, and its failures are retried up to 3 attempts in total

#### Scenario: The wrapper does not call the Task until it is run
- **WHEN** `retry(search)` is created and not called
- **THEN** `search` has not been called

### Requirement: The Task form behaves as the ctx-first form
A Task made by an effect SHALL behave as the `ctx`-first call with the same options: the same attempts, delays, time limit, errors and results.

#### Scenario: retry stops at the last attempt
- **WHEN** a wrapped Task fails on every attempt and `times` is 3
- **THEN** it is called 3 times and the result rejects with the last error

#### Scenario: timeout rejects and aborts the Task
- **WHEN** a wrapped Task does not finish within the given milliseconds
- **THEN** the result rejects with a `TimeoutError` and the signal of the context the Task received is aborted

#### Scenario: poll calls the Task at the given rate until the task ends
- **WHEN** `poll(100, task)` runs and its context is aborted after 250 ms
- **THEN** the Task has been called twice and the result resolves without an error

### Requirement: The context of a wrapped Task follows the caller
The context that a wrapped Task receives SHALL be a child of the context it was run with: it SHALL abort when that context aborts, and it SHALL carry the fields of the bus.

#### Scenario: An abort of the caller reaches the wrapped Task
- **WHEN** a handler `latest(retry(task))` is superseded by a newer call while `task` waits
- **THEN** the signal of the context that `task` received is aborted and no further attempt starts

#### Scenario: Context fields are available
- **WHEN** the bus has fields in `context` and a wrapped Task reads one from its context
- **THEN** it gets the value that the bus was given

### Requirement: Wrapped Tasks compose
A Task made by one effect SHALL be accepted by another effect, by a policy and by `ctx.run`, in any order, and the composition SHALL behave as each part says.

#### Scenario: Effects inside a policy
- **WHEN** `latest(retry(timeout(5000, search), { times: 3 }))` is subscribed and a newer event arrives during an attempt
- **THEN** the older attempt is aborted, no retry follows it, and only the newer call runs to its end

#### Scenario: ctx.run starts a wrapped Task as a child
- **WHEN** a handler calls `await ctx.run(retry(search), query)`
- **THEN** `search` receives `query`, the result is what `search` returned, and aborting the handler aborts the run

### Requirement: Both forms are supported
`retry`, `timeout` and `poll` SHALL keep their `ctx`-first forms unchanged, and SHALL tell the two forms apart by the first argument alone.

#### Scenario: The ctx-first call is unchanged
- **WHEN** `retry(ctx, () => load(), { times: 3 })` is called inside a handler
- **THEN** it behaves exactly as before this change

#### Scenario: The forms are told apart by the first argument
- **WHEN** the first argument is an object with a `signal`, a number or a function
- **THEN** an object selects the `ctx`-first form, a function (for `retry`) or a number (for `timeout` and `poll`) selects the Task form

### Requirement: Tracing shows the same groups
A Task made by an effect SHALL be traced as the effect group (`retry`, `timeout`, `poll`) with each attempt or call as a `run` child, as the `ctx`-first form is, when the bus has a tracer.

#### Scenario: The trace of a wrapped retry
- **WHEN** a wrapped `retry` runs a Task that fails once and then succeeds, on a traced bus
- **THEN** the trace has one `retry` group with two `run` children, and the group ends with `done`

### Requirement: The attempt number is not part of the Task form
A Task made by `retry` SHALL call the wrapped Task with `(payload, ctx)` only; the number of the attempt is available in the `ctx`-first form.

#### Scenario: A Task that needs the attempt number
- **WHEN** a handler needs the attempt number
- **THEN** it uses `retry(ctx, (attempt) => ..., options)`, which still passes it
