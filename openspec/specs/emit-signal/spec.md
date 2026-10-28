# emit-signal Specification

## Purpose
Lets `bus.emit(call, { signal })` tie the tasks of one emit to an outside `AbortSignal`, so a library that owns the request and gives you a signal (React Query) can cancel the handler, `latest`, `retry` and `timeout` through the bus.

## Requirements

### Requirement: signalPlugin links an emit to an outside signal
After `bus.use(signalPlugin())`, `bus.emit(call, { signal })` SHALL abort the `ctx.signal` of every task that this emit starts, with the same reason, when `signal` aborts. A `signal` that is already aborted SHALL abort those tasks at once. `emit` SHALL return what it returns without the plugin.

#### Scenario: Abort reaches the handler
- **WHEN** `bus.emit(getUser("1"), { signal })` is called and `controller.abort()` is called while the handler runs
- **THEN** `ctx.signal.aborted` of the handler is `true` and `ctx.signal.reason` is the reason of the controller

#### Scenario: The result is returned
- **WHEN** `await bus.emit(getUser("1"), { signal })` is called and nothing aborts
- **THEN** it resolves with the result of the handler, as `await bus.emit(getUser("1"))` does

#### Scenario: A signal that is aborted already
- **WHEN** `bus.emit(getUser("1"), { signal })` is called with an aborted signal
- **THEN** the tasks of the emit are aborted from the start, and a handler that uses `ctx.signal` stops at once

#### Scenario: A policy sees the abort
- **WHEN** the handler is wrapped in `latest` and the outside signal aborts
- **THEN** the run is aborted like any other abort of its task, and `latest` takes it as a cancel

### Requirement: Which tasks are linked
The linked tasks SHALL be those created while the call to `emit` runs: the task of the command or job, and the tasks of the listeners of its type. A task that a handler starts with `ctx.run` follows its parent. A separate `bus.emit` made later by a handler SHALL NOT be linked.

#### Scenario: Listeners of the type
- **WHEN** `bus.emit(loaded(user), { signal })` is called and the signal aborts while a listener runs
- **THEN** the `ctx.signal` of that listener is aborted

#### Scenario: Another emit is not linked
- **WHEN** a handler of an emit with `{ signal }` calls `bus.emit(other(x))` on its own
- **THEN** the tasks of `other` are not linked to that signal

### Requirement: It works with a scope in either order
`{ signal }` and a scope SHALL share the second argument of `emit`. `signal` SHALL be taken by `signalPlugin` and ignored by `scopePlugin`, in either order of the two plugins, and a scope given in the same object SHALL still apply.

#### Scenario: Signal and scope in one object
- **WHEN** `bus.emit(getUser("1"), { api: fakeApi, signal })` is called with both plugins on the bus
- **THEN** the handler reads `ctx.api` as `fakeApi` and is aborted by `signal`

#### Scenario: Either order
- **WHEN** `scopePlugin` is used before `signalPlugin`, or after it
- **THEN** both behave the same

### Requirement: It adds no work without a signal
An `emit` without a `signal` SHALL behave as without the plugin, and SHALL NOT add a listener to any signal.

#### Scenario: No signal given
- **WHEN** `bus.emit(getUser("1"))` is called with the plugin on the bus
- **THEN** the result and the order of listeners are the same as without the plugin

### Requirement: The link does not outlive the command
For a command or a job the subscription on the outside signal SHALL be removed when the promise of the emit settles, so a long-lived signal given to many emits does not collect subscriptions. A handler that returns without a promise is finished with the call, so its link SHALL end with the call. For an event the link SHALL stay until the signal aborts, and the docs SHALL say to give each request its own signal.

#### Scenario: Many commands on one signal
- **WHEN** fifty commands finish with the same `signal`, with an async and with a sync handler
- **THEN** none of their contexts is kept alive by the signal

### Requirement: The types accept the signal
After `bus.use(signalPlugin())`, the bus SHALL accept `{ signal }` as the second argument of the call forms of `emit`, and SHALL still reject it for the string form.

#### Scenario: Typed calls
- **WHEN** `bus.emit(getUser("1"), { signal })` is type-checked
- **THEN** it passes and has the type of the result of the command, and `bus.emit("type", payload, { signal })` is a type error

### Requirement: It works with the other plugins in any order
`signalPlugin` SHALL work with every other plugin of the library in any order, and SHALL be part of the plugin matrix test.

#### Scenario: Matrix
- **WHEN** the plugin matrix puts `signalPlugin` in every order with the others
- **THEN** its probe passes for each
