# signal-fetch Specification

## Purpose
Binds fetch to the signal of a task, so an aborted task also aborts its request.

## Requirements

### Requirement: signalFetch binds fetch to a signal
`signalFetch(signal)` from `nanoeffects/signal` SHALL return a function with the arguments of `fetch` that calls `fetch` with `signal`. When the call also has its own `signal` in `init`, the request SHALL stop when either aborts. The other fields of `init` SHALL pass unchanged. It SHALL work as the argument of `fromSignal`, so `contextPlugin({ fetch: fromSignal(signalFetch) })` gives each task a `ctx.fetch` that stops with the task.

#### Scenario: The request stops with the task
- **WHEN** a handler calls `ctx.fetch(url)` and its task is aborted
- **THEN** the request is aborted with the reason of the task signal

#### Scenario: A signal of the caller too
- **WHEN** `ctx.fetch(url, { signal: other })` is called
- **THEN** the request stops when the task aborts or when `other` aborts

#### Scenario: Other options
- **WHEN** `ctx.fetch(url, { method: "POST", body })` is called
- **THEN** `fetch` gets the same method and body
