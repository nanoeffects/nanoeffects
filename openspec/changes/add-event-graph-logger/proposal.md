# Proposal

## Why

Nothing in nanoeffects tells a developer that two handlers feed each other: `recalcTotal` emits `total/changed`, `syncCart` listens to it and emits `cart/changed`, and the page hangs or the network is flooded. The trace already holds the facts (`id`, `parentId`, `rootId`, `traceGroupId` on every event), but a reader must reconstruct the chain by hand from a log, and there is no map of which event leads to which. rxjs-spy ships a `CyclePlugin` for this; redux-saga, Effector and Redux DevTools give a monitor or an inspector and leave the loop hunt to the user.

Handlers are opaque functions, so the map of "event A leads to event B" can only come from running the app. The trace is the natural source.

## What Changes

- A new entry `nanoeffects/graph` with one trace logger, `graphLogger(options?)`. It is passed to `createTracer` like `consoleLogger` or `createTraceRecorder`; nothing is added to `createBus`, the other entries or the notrace builds.
- The logger builds a runtime graph from trace events: nodes are events and named listeners, edges are "a task of A emitted B", with counts. Modules group nodes by name.
- The same logger detects cycles while the app runs: a node that repeats in the chain of ancestors of a task (synchronous re-entry and loops across `await`), and an "event storm" for emits that come from outside any task (components) and repeat too often. A cycle is reported once per path, by default with `console.warn` and the path; `onCycle` replaces that, `devtools: true` also sends a `cycle/detected` action to Redux DevTools. Nothing is stopped.
- Methods on the logger read the result: `cycles()`, `toMermaid()`, `toDot()`, `toJSON()`, `clear()`. Cycle edges are marked in the exports.
- `TraceEvent` gets an optional `event`: for a listener named with `traceId` it is the event the listener handles (its `type` is the name). Without it the graph cannot draw the edge "event, then listener" for named listeners.
- An internal safe serializer for `toJSON({ payload: true })` and for the cycle report: `Error` (name, message, stack, cause), circular references, `Map` and `Set`, class instances, functions, `bigint`, `symbol`, DOM nodes, depth and size limits, getters never called. Payloads are left out of exports by default.
- Docs: a section in `docs/tracing.md` (and the Russian page), an entry in `docs/plugins.md`/`docs/package.md` tables and in `llms.txt`, an example under `examples/`, a `CHANGELOG.md` entry.

Not in this change: stopping or aborting a cycle, a static (declaration-based) graph, a Redux DevTools `serialize` option for `reduxDevtools`, a browser UI, and a `bus.use(...)` plugin form (a tracer is fixed at `createBus`, so a plugin cannot add a logger later).

## Capabilities

### New Capabilities
- `event-graph`: the runtime graph a `graphLogger` builds from trace events, its read methods and exports (Mermaid, DOT, JSON), and the safe serialization of what it exports.
- `event-cycles`: detection of event cycles and storms from the same logger, and how they are reported (console, `onCycle`, Redux DevTools).

### Modified Capabilities
- `trace-types`: `TraceEvent` carries `event` for the task of a named listener. Nothing else in the contract changes, and `tracePlugin` stays optional.

## Impact

- New code in `src/graph/` (entry `nanoeffects/graph`), new entry in `package.json` `exports`, `tsdown.config.ts` and a `size-limit` item. The only change near the core is the `event` field in `createTracer`/`TraceEvent` (tracing side, not the code of `createBus`); `createBus` is measured before and after and must stay at its size.
- No `notrace` build of the entry: with `TRACE` off there is no tracer and the logger never gets an event.
- Docs, Russian docs, `llms.txt`, `docs/plugins.md`, `docs/package.md`, `examples/`, `CHANGELOG.md`.
- Tests: unit tests next to the files, a cycle scenario in `src/tests/`, and the architecture test must keep `src/graph` above `src/core` with no cycles.
