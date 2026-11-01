# Proposal

## Why

Nothing in nanoeffects tells a developer that two handlers feed each other: `recalcTotal` emits `total/changed`, `syncCart` listens to it and emits `cart/changed`, and the page hangs or the network is flooded. The trace already holds the facts (`id`, `parentId`, `rootId`, `traceGroupId` on every event), but a reader must reconstruct the chain by hand from a log, and there is no map of which event leads to which. rxjs-spy ships a `CyclePlugin` for this; redux-saga, Effector and Redux DevTools give a monitor or an inspector and leave the loop hunt to the user.

Handlers are opaque functions, so the map of "event A leads to event B" can only come from running the app. The trace is the natural source.

## What Changes

- A graph logger inside `nanoeffects/trace` with one trace logger, `graphLogger(options?)`. It is passed to `createTracer` like `consoleLogger` or `createTraceRecorder`; nothing is added to `createBus`, the other entries or the notrace builds.
- The logger builds a runtime graph from trace events: nodes are events and named listeners, edges are "a task of A emitted B", with counts. Modules group nodes by name.
- The same logger detects cycles while the app runs: a node that repeats in the chain of ancestors of a task (synchronous re-entry and loops across `await`), and an "event storm" for emits that come from outside any task (components) and repeat too often. A cycle is reported once per path, by default with `console.warn` and the path; `onCycle` replaces that, `devtools: true` also sends a `cycle/detected` action to Redux DevTools. Nothing is stopped.
- Methods on the logger read the result: `cycles()`, `toMermaid()`, `toDot()`, `toJSON()`, `clear()`. Cycle edges are marked in the exports.
- A trace logger may have an optional `task` method that `createTracer` calls for every task as it is made, also for plain handlers that report no event, so a logger sees the whole tree of tasks (a plain handler leaves a gap in the events: its children name a parent that was never reported).
- Reports also name the root of the chain and a line of advice, and keep counting turns of a path; `name` and `ignore` options; a per-root step budget (`maxSteps`) for chains of generated names; graph-level cycles found with an iterative algorithm; and, with `devPlugin`, the call site of a listener. These come from reading the debugger of deffector and the logger of Effector.
- An internal safe serializer for `toJSON({ payload: true })` and for the cycle report: `Error` (name, message, stack, cause), circular references, `Map` and `Set`, class instances, functions, `bigint`, `symbol`, DOM nodes, depth and size limits, getters never called. Payloads are left out of exports by default.
- Docs: a section in `docs/tracing.md` (and the Russian page), an entry in `docs/plugins.md`/`docs/package.md` tables and in `llms.txt`, an example under `examples/`, a `CHANGELOG.md` entry.

- A group of reproducible debugging examples: `examples/debug` (runnable scenarios with fixed output: each loop shape, a storm, a clean flow, hostile payloads, exports to files) and `examples/debug-playground` (a page with a button for each loop, Redux DevTools and a drawn graph), tested so they do not rot, and a how-to page `docs/debugging-loops.md`.
- A second, opt-in entry `nanoeffects/guard` with `loopGuardPlugin(options?)`: a bus plugin that cuts a loop at run time. It refuses an emit when the same event repeats `maxRepeats` times in a chain (default 50) or the chain passes `maxDepth` (default 1000), by dropping it (default) or throwing a `LoopError`, always with a report; `maxPerSecond` limits emits that come from outside any task. It needs no tracer, so it is usable in production as a safety net. It uses `bus.addContext` and wraps `ctx.emit` and `bus.emit` only, so `createBus` does not change.

Not in this change: aborting the whole chain through its root signal (needs a hook in the core), a static (declaration-based) graph, a Redux DevTools `serialize` option for `reduxDevtools`, a browser UI, and a `bus.use(...)` plugin form (a tracer is fixed at `createBus`, so a plugin cannot add a logger later).

## Capabilities

### New Capabilities
- `event-graph`: the runtime graph a `graphLogger` builds from trace events, its read methods and exports (Mermaid, DOT, JSON), and the safe serialization of what it exports.
- `event-cycles`: detection of event cycles and storms from the same logger, and how they are reported (console, `onCycle`, Redux DevTools).

- `debug-examples`: the folder of runnable debugging scenarios, the browser playground, their tests and the how-to page.
- `loop-guard`: the opt-in plugin that cuts a looping chain, its limits, actions and reports.

### Modified Capabilities
- `dev-diagnostics`: `devPlugin` can record the call site of each subscription, for the reports of the graph logger.
- `trace-types`: a logger may watch tasks as they are made through an optional `task` method. Events and `Tracer` do not change, and `tracePlugin` stays optional.

## Impact

- New code in `src/graph/`, exported from the existing entry `nanoeffects/trace` (no new entry; a bundler drops it when `graphLogger` is not imported) with its own `size-limit` item. The only change near the core is the `task` hook in `createTracer` and the `TraceLogger` type (tracing side, not the code of `createBus`); `createBus` is measured before and after and must stay at its size.
- New entry `nanoeffects/guard` (own `size-limit`, no `notrace` build needed: it does not use the tracer).
- No `notrace` build of `nanoeffects/trace`: with `TRACE` off there is no tracer and the logger never gets an event.
- New folders `examples/debug` and `examples/debug-playground` (type-checked, tested in `src/tests/debug-examples.test.ts`), added to `examples/README.md`.
- Docs, Russian docs, `llms.txt`, `docs/plugins.md`, `docs/package.md`, `examples/`, `CHANGELOG.md`.
- Tests: unit tests next to the files, a cycle scenario in `src/tests/`, and the architecture test must keep `src/graph` above `src/core` with no cycles.
