# Design

## Context

`devPlugin` already wraps `bus.addContext` to watch `ctx.emit` and `ctx.on` of each task (see the archived `add-event-graph-logger`). A request is a call that nothing in the bus sees, so it needs a way to tell which task made it.

## Decisions

### D1. AsyncLocalStorage, from `process.getBuiltinModule`
The plugin enters the task with `als.enterWith(task)` in `addContext` and patches `globalThis.fetch` to read the store. `AsyncLocalStorage` is taken with `process.getBuiltinModule("node:async_hooks")`, not an import, so a bundler for the browser sees nothing to resolve; without it the tracker is off. Alternative: attribute by the signal a request carries. That cannot find a request with no signal, which is the case to find.

### D2. Put the caller's context back
`enterWith` in `addContext` would leave the last task as the store of the code that called `bus.emit`. The plugin wraps `bus.emit` and `ctx.run` to put the previous store back when the synchronous call returns; the continuations that the handler made already captured their own store. A probe on this repository showed a request inside a `latest` handler after `await` is attributed to its task, and the store after `bus.emit` is empty.

### D3. Count at the abort, compare the signal
When a task that made a request aborts, a microtask later the plugin counts each of its requests that is still running and whose signal is missing or did not abort. A request linked to the parent signal of a child that is aborted alone (a `timeout`) is counted too, which is right: the timeout could not stop it.

### D4. signalFetch is a few lines
It joins the task signal with the caller's through `AbortSignal.any` when both exist. It lives in `nanoeffects/signal` next to `fromSignal`.

### D5. requireContext is strict on purpose
With `requireContext: true` a call that waits must go through `ctx`, even when it passes `ctx.signal` by hand. The policy it enforces is "the signal is bound once", not "the signal is passed".

## Risks

- [A request attributed to a child of the same handler] → the child aborts with the parent, so the count is the same.
- [Patching global fetch] → a pass-through wrapper, put back on disconnect, and `requests: false`.
