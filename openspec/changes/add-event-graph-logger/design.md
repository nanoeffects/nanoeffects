# Design

## Context

See proposal.md for the motivation. What the code gives today:

- A tracer is fixed in `createBus({ trace })` and each task context keeps it (`src/core/context.ts`). `bus.trace` is read-only, so a plugin cannot add a logger to a bus later. Loggers are the extension point.
- A task has `parentId` from `currentEmitter()`, which `ctx.emit` sets for the synchronous time of the emit. The chain survives `await` because the child task is made at the emit, not when the parent ends.
- `tracePlugin` adds a leaf event `effect: "emit"` for each emit (also with no listener) and renames a listener task to its `traceId`. Without it a listener task is typed by its event, and the emit is not seen.
- A listener task is a sibling of the emit leaf of the same emit (both children of the emitting task). After a rename the `type` of the task is the name, and the event it handles is lost.
- Emits from outside a task (components, timers, tests) are roots with no `parentId`.

## Goals / Non-Goals

**Goals:**
- One logger, no required option, that gives the map, finds cycles at run time and exports.
- Nothing in `createBus`; the new code sits in its own entry and is dropped by a bundler when unused.
- Cheap enough for development always on; usable in production with care (see Risks).

**Non-Goals:**
- Stopping a cycle, a static graph from declarations, a UI, a `bus.use` form.
- A new id: `id` and `parentId` already give the chain. No automatic `traceId` or `traceGroupId` (it would add work to the hot path of `emit`).

## Decisions

### D1. A logger, not a plugin
A tracer is bound at `createBus`, so only a `TraceLogger` can see events without a change in the core. Alternatives: a plugin that wraps `bus.trace` methods (mutates a shared object, breaks "plugins work in any order"); a new hook in the core (grows `createBus`, which sits at its limit). Rejected both.

### D2. Nodes and edges
A node is a name: the `traceId` of a named listener, else the event `type`. Edges:

- from the node of a task to the node of each child task or emit leaf it has (`parentId`);
- for a named listener, an edge from its event to the listener, from the new `event` field (D3).

So the map reads `cart/changed` to `recalcTotal` to `total/changed` to `syncCart` to `cart/changed`. Without `tracePlugin` there are no leaves and no names, and the map has event nodes only: coarser, still correct for cycles. Edges keep a count in a `Map` keyed by the pair; nodes sit in a `Map` by name. Memory grows with the graph, not with events.

### D3. `TraceEvent.event`
`createTracer` keeps the original type when `rename` is called, and puts it in `event` of every event of the renamed task. Alternative: the logger guesses the event by matching the emit leaf and the listener task with the same parent (order and timing dependent, wrong with two listeners or a policy that delays the start). A field is exact and costs one optional property in `src/trace/tracer.ts`, not in `createBus`. `createBus` is measured before and after.

### D4. The chain table
The logger keeps `id` to `{ node, parent, depth }` for tasks that have started and not ended, and drops an entry on `done`, `error`, `cancel`, `drop`. An emit leaf has no end: it is read at once and not stored. The chain of a task is walked up through this table; if a parent is gone (it ended while the child still runs, which is normal after `await`) the walk stops there. A cycle across a long async gap needs the ancestors alive, so for it the logger also keeps, for each task, a compact `chain` array of node ids copied from its parent at the start (depth bounded, see D5). Alternative: walk only live ancestors. That misses `a`, then a timer, then `b`, then `a` when `a` has ended. Copying is bounded by `repeats * nodes` and dropped with the task.

### D5. Detecting a repeat cheaply
Each task carries the counts of nodes along its chain as a small `Map`/object copied from the parent plus its own node (copy on write, so a chain with no repeat of a node shares its parent's table when possible). When the own node reaches `repeats`, the cycle is the segment of the chain between the first and the current occurrence. The path key is the list of node names; it is stored in a `Set` to report once. A chain longer than a hard cap (default 1000 nodes) stops copying and reports a `runaway chain`, so a loop of distinct generated event names cannot eat memory.

### D6. Storm
A root emit (no `parentId`) is counted in a ring of timestamps per event type; `count` emits inside `perMs` is a storm. The time comes from `performance.now()` read only for root emits, so a handler chain pays nothing. Reported once per window. Because roots only exist as events when `tracePlugin` reports the emit, without it the storm uses the root task `start` of the type. With `sample < 1` the count is low; documented.

### D7. Reporting
A report is a plain object `{ kind: "cycle" | "storm", path, repeats, traceGroupId? }`. Default sink is one `console.warn` line. `onCycle` replaces it. `devtools: true` connects to `__REDUX_DEVTOOLS_EXTENSION__` under its own instance name and sends `cycle/detected`; no extension means no call. The payload is never part of a report.

### D8. Exports and safe serialization
`toMermaid`, `toDot`, `toJSON` are methods of the logger that read a snapshot. Names are escaped per format. A serializer (internal to `src/graph`) makes any value plain: cycles, `Error`, `Map`, `Set`, class instances, functions, DOM nodes, depth and size limits, no getter call. It is used by `toJSON({ payload: true })` only. Putting it into `reduxDevtools` is a later, separate change.

### D9. The test matrix
Detection depends on where an emit and a subscription come from, so tests are a matrix, not a few cases (see tasks 5 and 6):

- emit: inside a handler (`ctx.emit`), outside (`bus.emit` at top level, a timer, a promise callback), from a component (`useEmitter`, a call in an effect), from a module's `setup`;
- subscription: inside a handler (a listener added while a handler runs), outside (`bus.on` at top level), in a module (`modulePlugin`), in a component (`useEffect` that subscribes and unsubscribes), named and not named;
- shapes: self loop, two-node loop, three-node loop, a loop across `await`, across a policy (`latest`, `debounce`, `queue`), across `retry`, through an action or job, a diamond (no cycle), a fan-out (no cycle), a deep chain (no cycle);
- lifetime: a subscription removed in the middle, an unmounted component, `off` during a loop, `app.unmount()`.

## Risks / Trade-offs

- [A cycle through a UI that re-renders is seen as a storm, not as a chain] → the storm check, and `traceGroupId` joins the roots when the app sets it.
- [Cost in production] → one `Map` lookup per event and a copy of a small table per task; the logger is for development by default, and `sample` cuts the volume (it samples by root, so chains stay whole, but storm counts drop).
- [A false positive: a legitimate recursion, e.g. a tree walk that emits per level] → `repeats` is an option; a report never stops anything.
- [Unnamed listeners of one event merge into one node] → documented; `traceId` separates them, and `tracePlugin` warns once when it is missing.
- [Adding `event` to `TraceEvent` is a type change] → it is optional, existing loggers ignore it, and `types.test.ts` and the trace specs guard it.
- [A logger throwing or `onCycle` throwing] → `combineLoggers` already isolates it; `onCycle` is wrapped too.

## Migration Plan

Additive: a new entry and one optional field. Nothing to migrate. Rollback is removing the entry; the `event` field is harmless alone.

## Open Questions

- The default of `repeats` (3), of the storm (100 in 1000 ms) and of the chain cap (1000) are starting points; the example apps are used in task 6 to see whether they report falsely, and the values may change without a change in the specs' shape.
