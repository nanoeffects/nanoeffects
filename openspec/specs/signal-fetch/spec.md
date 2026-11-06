# signal-fetch Specification

## Purpose
Binds fetch to the signal of a task, so an aborted task also aborts its request.

## Requirements

### Requirement: signalFetch binds fetch to a signal
`signalFetch(ctx, input, init?)` from `nanoeffects/signal` SHALL call `fetch(input, init)` with the `signal` of `ctx` and return its promise. When `init` also has a `signal` of its own, the request SHALL stop when either aborts. The other fields of `init` SHALL pass unchanged.

#### Scenario: The request stops with the task
- **WHEN** a handler calls `signalFetch(ctx, url)` and its task is aborted
- **THEN** the request is aborted with the reason of the task signal

#### Scenario: A signal of the caller too
- **WHEN** `signalFetch(ctx, url, { signal: other })` is called
- **THEN** the request stops when the task aborts or when `other` aborts

#### Scenario: Other options
- **WHEN** `signalFetch(ctx, url, { method: "POST", body })` is called
- **THEN** `fetch` gets the same method and body

#### Scenario: The cancelled call of a policy
- **WHEN** a `latest` handler calls `signalFetch(ctx, url)` and a newer call cancels it
- **THEN** the request of the first call is aborted and the request of the second is not

### Requirement: signalFetch takes any object with a signal
`ctx` is the first argument, as for the other effects, and any object with a `signal` SHALL be accepted by the types, so the context of a task and `{ signal }` of an outside source work; at run time an object with no `signal` (`{}`) SHALL also work.

#### Scenario: A signal that is not a task's
- **WHEN** `signalFetch({ signal: outside }, url)` is called
- **THEN** the request stops when `outside` aborts

#### Scenario: No signal at all
- **WHEN** `signalFetch({}, url)` is called
- **THEN** `fetch` is called as it would be without the helper, with the `signal` of `init` if there is one

### Requirement: signalFetch needs no plugin and has no factory form
It SHALL work with no plugin on the bus, and as an effect of `effectsPlugin`, so `effectsPlugin({ fetch: signalFetch })` gives each task a `ctx.fetch(input, init)` that stops with the task. The factory form `signalFetch(signal)` SHALL no longer exist.

#### Scenario: No setup on the bus
- **WHEN** a bus has no `contextPlugin`, no `effectsPlugin` and no `signalPlugin`, and a handler calls `signalFetch(ctx, url)`
- **THEN** the request carries the signal of the task

#### Scenario: As a field of the context
- **WHEN** the bus uses `effectsPlugin({ fetch: signalFetch })` and a handler calls `ctx.fetch(url)`
- **THEN** the request stops with the task, and the type of `ctx.fetch` has no `ctx` parameter

#### Scenario: The factory form is gone
- **WHEN** code calls `signalFetch(signal)` with an `AbortSignal` as the only argument
- **THEN** the type checker reports an error
