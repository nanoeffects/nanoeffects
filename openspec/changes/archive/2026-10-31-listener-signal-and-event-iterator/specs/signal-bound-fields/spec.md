# Spec Delta

## Purpose

Lets a field of the context be a value that needs the signal of its task (an HTTP client, a database handle), declared once on the bus and built for each task that reads it.

## ADDED Requirements

### Requirement: fromSignal marks a context field that is built from the task signal
`fromSignal(make)` from `nanoeffects/signal` SHALL return a marker that `contextPlugin` accepts as the value of a field. For a task that reads `ctx.<field>`, the value SHALL be `make(ctx.signal)` with the signal of that task. The type of `ctx.<field>` SHALL be the return type of `make`, not the marker.

#### Scenario: The field is bound to the task
- **WHEN** `contextPlugin({ http: fromSignal((signal) => makeClient(signal)) })` is used and a handler reads `ctx.http`
- **THEN** `makeClient` was called with the `ctx.signal` of that handler's task

#### Scenario: The type is the made value
- **WHEN** `make` returns `Client` and `ctx.http` is type-checked
- **THEN** its type is `Client`

#### Scenario: Plain fields are unchanged
- **WHEN** a plugin has `store`, `logger` and a `fromSignal` field together
- **THEN** `store` and `logger` are put on the context as they are

### Requirement: The value is built on first read and kept for the task
`make` SHALL NOT be called until the field is read, SHALL be called at most once for a task, and the same value SHALL be returned for later reads. A task that never reads the field SHALL not call `make`.

#### Scenario: Not read, not built
- **WHEN** a handler runs and does not read `ctx.http`
- **THEN** `make` was not called

#### Scenario: Built once
- **WHEN** a handler reads `ctx.http` three times
- **THEN** `make` was called once and the three values are the same

### Requirement: A child task gets its own value
A task made by `ctx.run` SHALL build its own value from its own signal, and SHALL NOT receive the value of its parent. Reading the field in a child SHALL NOT build the value of the parent.

#### Scenario: Child signal
- **WHEN** a handler runs a child with `ctx.run` and the child reads `ctx.http`
- **THEN** `make` was called with the `ctx.signal` of the child, which is not the signal of the parent

#### Scenario: Parent not built by the child
- **WHEN** only the child reads `ctx.http`
- **THEN** `make` was called once, for the child

### Requirement: Reading the context does not build the field
Copying or listing the context (spread, `Object.keys`, a logger or a trace that walks it) SHALL NOT call `make`. `"http" in ctx` SHALL be true.

#### Scenario: A trace does not build it
- **WHEN** a bus with a tracer and a `fromSignal` field runs a handler that does not read the field
- **THEN** `make` was not called

### Requirement: The signal of the value is the signal of its task
When the task aborts, the value SHALL have been built with a signal that is aborted, so a request in flight stops. A task that is aborted before the first read SHALL build the value with an aborted signal.

#### Scenario: Abort reaches the request
- **WHEN** a handler starts a request with `ctx.http` and the task is aborted with `emit(call, { signal })` or by a policy
- **THEN** the signal that `make` received is aborted with the same reason

### Requirement: It follows the rules of contextPlugin
A name that the bus already has SHALL still be a type error, the fields of the library (`signal`, `emit`, `run`) SHALL still win, and the plugin SHALL work in any order with the other plugins and be part of the plugin matrix. `createBus` SHALL NOT grow.

#### Scenario: A clash
- **WHEN** a `fromSignal` field is named `signal`
- **THEN** it is a type error and the library `ctx.signal` stays

#### Scenario: Matrix
- **WHEN** the plugin matrix puts `contextPlugin` with a `fromSignal` field in every order with the others
- **THEN** its probe passes for each
