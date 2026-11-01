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
- Nothing in `createBus`; the logger sits in the `nanoeffects/trace` entry, next to the other loggers, and a bundler drops it when it is not imported.
- Cheap enough for development always on; usable in production with care (see Risks).

**Non-Goals:**
- Stopping a cycle, a static graph from declarations, a UI, a `bus.use` form.
- A new id: `id` and `parentId` already give the chain. No automatic `traceId` or `traceGroupId` (it would add work to the hot path of `emit`).

## Decisions

### D1. A logger, not a plugin
A tracer is bound at `createBus`, so only a `TraceLogger` can see events without a change in the core. Alternatives: a plugin that wraps `bus.trace` methods (mutates a shared object, breaks "plugins work in any order"); a new hook in the core (grows `createBus`, which sits at its limit). Rejected both.

### D2. Nodes and edges
A node is a name: the `traceId` of a named listener, else the event `type`. Edges:

- from the node of a task to the node of each child task or emit leaf it has;
- for a named listener, an edge from its event to the listener (the second `task` call of a rename gives `event`).

With `tracePlugin` each emit makes a leaf and a task for the handler, both children of the emitting task; the logger counts the edge to an event node from leaves only once it has seen a leaf, and from tasks otherwise, so an emit is one edge, not two. Without `tracePlugin` there are no leaves and no names: event nodes only, coarser, still right for cycles. Edges keep a count in a `Map` keyed by the pair; nodes sit in a `Map` by name. Memory grows with the graph, not with events.

### D3. The `task` hook, not the events, builds the tree
A plain handler reports no event (only `latest` and the like, `ctx.run`, a named listener and the emit leaf do), so its children name a `parentId` that no logger ever saw: the chain `a`, `b` is not in the events. Checked in a probe on this repository. Alternatives: report every handler task (more events in every existing log and in Redux DevTools depth, breaks the tests that count events), put the parent's type on each event (the chain above the parent is still missing), match ids (fragile). The chosen way: `createTracer` calls an optional `task({ ref, parent, id, type, event?, leaf?, traceGroupId? })` of a logger when a task is made and when it is renamed. It costs nothing without such a logger (one check made once at `createTracer`) and the sampling rule is kept. `ref` is the opaque handle the tracer already makes, so a logger can keep its data in a `WeakMap` by `ref`.

### D4. The chain is a persistent record, freed by the garbage collector
Each task gets a record `{ node, parent, depth, counts }` in a `WeakMap` keyed by `ref`; the record points to its parent's record. Nothing needs to be freed when a task ends (a plain handler never reports an end), a record lives while a child or the app holds the `ref`, and a chain across a long `await` is still there because the child holds its parent. This removes the table keyed by id and the question of when to delete from it.

### D5. Detecting a repeat cheaply
Each record carries the counts of nodes along its chain as a small `Map` copied from the parent's plus its own node (copy on write: a task that adds no repeat of a node shares its parent's map when it can). When the own node reaches `repeats`, the cycle is the segment of the chain between the first and the current occurrence. The path key is the list of node names; it is stored in a `Set` to report once. A root also has a step counter (`maxSteps`, default 5000, the same idea as the `maxSteps` of deffector's Health tab): when it passes, a `runaway chain` is reported once and the logger stops copying chain tables for that root, so a loop of distinct generated event names cannot eat memory. `ignore` names are skipped by these counts.

### D5a. The logger is iterative and re-entry safe
Walking a chain, copying tables and building a path use loops, never recursion (a chain can be deeper than the stack the app has left). The report runs after the logger has updated its own state and behind a guard: events that arrive while a report runs are processed normally, and a path already in the reported set is not reported again. This is the lesson of effector issue 331 (the cost of the protection itself), xstate issue 4004 (a callback called again by its own failure path) and Node `EventEmitter` stack overflows (the app overflows, so the report must come first).

### D6. Storm
A root emit (no `parentId`) is counted in a ring of timestamps per event type; `count` emits inside `perMs` is a storm. The time comes from `performance.now()` read only for root emits, so a handler chain pays nothing. Reported once per window. Because roots only exist as events when `tracePlugin` reports the emit, without it the storm uses the root task `start` of the type. With `sample < 1` the count is low; documented.

### D7. Reporting
A report is a plain object `{ kind: "cycle" | "storm", path, repeats, traceGroupId? }`. Default sink is one `console.warn` line. `onCycle` replaces it. `devtools: true` connects to `__REDUX_DEVTOOLS_EXTENSION__` under its own instance name and sends `cycle/detected`; no extension means no call. The payload is never part of a report.

### D8. Exports and safe serialization
`toMermaid`, `toDot`, `toJSON` are methods of the logger that read a snapshot. Names are escaped per format. A serializer (internal to `src/graph`) makes any value plain: cycles, `Error`, `Map`, `Set`, class instances, functions, DOM nodes, depth and size limits, no getter call. It is used by `toJSON({ payload: true })` only. Putting it into `reduxDevtools` is a later, separate change.

### D9. The test matrix and the regression corpus
Besides the matrix below, group 6 of tasks.md turns the loops that users of other event libraries reported (RxJS, Effector, redux-saga, redux-observable, XState, Svelte, MobX, Preact Signals, Vue, TanStack Query, Node `EventEmitter`) into regression tests, one test per report, named after it, as `src/tests/regressions.*` already do.

### D9a. The matrix
Detection depends on where an emit and a subscription come from, so tests are a matrix, not a few cases (see tasks 5 and 6):

- emit: inside a handler (`ctx.emit`), outside (`bus.emit` at top level, a timer, a promise callback), from a component (`useEmitter`, a call in an effect), from a module's `setup`;
- subscription: inside a handler (a listener added while a handler runs), outside (`bus.on` at top level), in a module (`modulePlugin`), in a component (`useEffect` that subscribes and unsubscribes), named and not named;
- shapes: self loop, two-node loop, three-node loop, a loop across `await`, across a policy (`latest`, `debounce`, `queue`), across `retry`, through an action or job, a diamond (no cycle), a fan-out (no cycle), a deep chain (no cycle);
- lifetime: a subscription removed in the middle, an unmounted component, `off` during a loop, `app.unmount()`.

### D10. What comes from other debuggers
From deffector (the one tool found that has loop checks): the per-transaction step budget (D5), iterative Tarjan over the graph (the graph-level `cycles()`, which finds loops seen only in pieces), a count of turns beside a report, a fix hint with each finding, and the root of the chain in a report. From effector-logger and patronum `debug`: a `name`, `ignore` (their `configure(..., "disabled")`) and the reverse "caused by" trace, which is our root-and-path line. From effector-inspector and the babel plugin's `addLoc`: the call site, from `devPlugin` (D8 of the spec).

### D11. The loop guard
A different job from the logger: it must work with no tracer and in production, so it is its own entry (`nanoeffects/guard`) and not a part of `graph` or `dev` (`dev` is a no-op in production). It is a plugin of the bus, `plugin(bus)`, with no change in `createBus`:

- `bus.addContext` is called with every new task context. The plugin gives the context a record `{ type, parent, depth }` in a `WeakMap`, where `parent` is the record of the emit that is running (a module variable set around the synchronous call of the wrapped `ctx.emit`, the same idea as `currentEmitter()`), and replaces `ctx.emit` with a wrapper that checks the limits first. The wrapper is the same one that runs after an `await`, so a chain is followed across asynchronous gaps.
- For an emit from outside a task, `bus.emit` is wrapped for the `maxPerSecond` ring and to start a chain at depth 0.
- The repeat check walks the records only when `depth >= maxRepeats` (a fast path), at most `maxDepth` steps, counting records whose `type` is the emitted one and is not in `ignore`.
- The refusal is "do not call the inner emit": the chain is cut at that edge, other chains are untouched, and nothing is aborted. Alternatives: abort the root task through `ctx.abort` (it would stop siblings that are not looping, and the core gives the plugin no handle to the root); throw by default (adds new unhandled rejections in async handlers, so it is opt-in). A tracer is not needed, but a tracer that is present still sees the tasks that ran.
- The wrapping of `ctx.emit` is checked against the other plugins that touch the same fields in `src/tests/plugin-matrix.test.ts` for every order.

### D12. Debugging examples
Each scenario in `examples/debug/<name>.ts` exports `run()` that returns its findings and, when the file is run directly, prints them: the same code serves a reader (terminal), a test (assertions) and the docs page (blocks quoted from the file). Time comes from `delay` of a few milliseconds or, where a window matters (storm), from a clock passed to the scenario, so output is stable; `onCycle` collects reports instead of printing when the scenario is run by a test. The folder follows the layering of the other examples (bus in `bus.ts`, events in a file named for the domain, handlers apart) so it can be copied. The browser playground reuses the same scenarios as modules, wires `graphLogger({ devtools: true })` and `reduxDevtools`, and draws `toMermaid()` with the `mermaid` package from a CDN pinned to a version. It is a copy of `playground-devtools` in structure (own `package.json` using the published package, `tsconfig` paths to `src` for the repository type check). The tests live in `src/tests/debug-examples.test.ts`, like `backend-examples.test.ts`.

## Risks / Trade-offs

- [A cycle through a UI that re-renders is seen as a storm, not as a chain] → the storm check, and `traceGroupId` joins the roots when the app sets it.
- [Cost in production] → one `Map` lookup per event and a copy of a small table per task; the logger is for development by default, and `sample` cuts the volume (it samples by root, so chains stay whole, but storm counts drop).
- [A false positive: a legitimate recursion, e.g. a tree walk that emits per level] → `repeats` is an option; a report never stops anything.
- [Unnamed listeners of one event merge into one node] → documented; `traceId` separates them, and `tracePlugin` warns once when it is missing.
- [The `task` hook is a new part of the logger contract] → it is optional, a plain function is still a `TraceLogger`, and `types.test.ts` and the trace specs guard it.
- [A logger throwing or `onCycle` throwing] → `combineLoggers` already isolates it; `onCycle` is wrapped too.

## Migration Plan

Additive: new entries and one optional hook. Nothing to migrate. Rollback is removing the entries; the hook is harmless alone.

## Open Questions

- **The emergency stop** is `loopGuardPlugin` (D11), not part of the logger: the logger only reports. Stopping the whole chain through the signal of its root needs a hook in the core and is left out. The defaults (`maxRepeats` 50, `maxDepth` 1000) are starting points to tune on the example apps.
- **A chain broken by `bus.emit` in a handler.** deffector flags "call outside of scope". The same check here (a root emit that arrives while a handler of the same bus runs) needs to be verified against how `currentEmitter()` behaves after an `await`; task 5.4 pins the behavior first, and a check is added only if the result is reliable.

- The default of `repeats` (3), of the storm (100 in 1000 ms) and of the chain cap (1000) are starting points; the example apps are used in task 6 to see whether they report falsely, and the values may change without a change in the specs' shape.
