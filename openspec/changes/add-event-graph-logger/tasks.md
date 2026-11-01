# Tasks

Every group lands its own tests and docs. `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run` must pass at the end of each group; `pnpm verify` at the end of group 8. Test names follow AGENTS.md (no abbreviations; `noPayload` for an `undefined` payload; fake timers for anything with time).

## 1. The `event` field and the entry

- [ ] 1.1 In `src/trace/tracer.ts` keep the original type on `rename` and put it in `event` of the events of a renamed task; add `event?: string` to `TraceEvent` in `src/core/types.ts`. Verify with tests in `src/trace/tracer.test.ts` and `src/trace/plugin.test.ts` (named listener has `type` and `event`, unnamed has no `event`, a tracer without `rename` still works) and a `@ts-expect-error`-free check in `src/tests/types.test.ts`.
- [ ] 1.2 Measure `createBus` (rolldown, brotli) before and after 1.1 and note both numbers in the commit message; verify `pnpm size` passes with the limit unchanged.
- [ ] 1.3 Add `src/graph/index.ts` (re-exports only), the `./graph` export in `package.json`, the entry in `tsdown.config.ts` (no `notrace` build, no `production` build) and a `size-limit` item. Verify `pnpm build`, `pnpm lint:package`, `src/tests/exports.test.ts` and `src/tests/architecture.test.ts` (`src/graph` imports `src/core` types only, no cycles).

## 2. Safe serializer

- [ ] 2.1 Write the serializer in `src/graph/serialize.ts` (`Error` with `cause`, circular, `Map`, `Set`, class instance, function, `bigint`, `symbol`, DOM node, `maxDepth`, `maxSize`, getters never called). Verify with `serialize.test.ts`: every row of the spec scenarios, plus a table test over hostile values (null-prototype object, `Proxy` that throws on `get`, an object with a throwing getter, a throwing `toJSON`, a sparse array, a typed array, a `Date`, an invalid `Date`, a `WeakMap`, a frozen object, an array of 1e6 items) that asserts `JSON.stringify(result)` never throws and the call never throws.
- [ ] 2.2 Add a property test (fast-check if the project has it, else a seeded random generator like `fuzz.test.ts`) that builds random nested values with cycles and checks the result is JSON-safe and finite.

## 3. Graph core

- [ ] 3.1 Implement `graphLogger()` in `src/graph/logger.ts` with nodes, edges and counts from trace events (names from `traceId` or `type`, event-to-listener edges from `event`), and the table of live tasks that is freed on `done`, `error`, `cancel`, `drop`. Verify with `logger.test.ts`: the spec scenarios of `event-graph` (counted edges, named listeners, emit with no listener, sampled events, no growth after 10 000 runs, `clear()`).
- [ ] 3.2 Implement `toMermaid`, `toDot`, `toJSON` (with `group: "module"` and `payload: true`) in `src/graph/export.ts`. Verify with `export.test.ts`: snapshot of a small graph in each format, awkward names (quotes, brackets, newline, unicode, an empty string, a very long name), cycle edges marked, no payload by default (a "password" payload does not appear), and `JSON.stringify(toJSON())` never throws. Parse the Mermaid output with the mermaid package if it is already a dev dependency of the docs site; otherwise check the structure by pattern.
- [ ] 3.3 Document `graphLogger` in `docs/tracing.md` (section "Find loops and map the events", JS first, comments on each library call) and in the Russian page; docs:check must pass (`pnpm docs:check`).

## 4. Cycle and storm detection

- [ ] 4.1 Implement the chain counts, the path key and the report-once rule (`src/graph/cycles.ts`), with `repeats` and the chain cap. Verify with `cycles.test.ts`: every scenario of `event-cycles` (two handlers, self emit, across `await` with fake timers, long chain with no repeat, repeat below the limit, siblings, once per path, two paths, nothing stopped).
- [ ] 4.2 Implement the sinks: default `console.warn`, `onCycle` (wrapped so a throw is reported, not raised), `devtools: true` with a fake `ReduxExtension`, no extension. Verify with `report.test.ts`, including that no payload is in any report.
- [ ] 4.3 Implement the storm for root emits (ring of timestamps per type, `storm: false`). Verify with fake timers: 100 in a second reports once per window, 100 in ten seconds does not, handler emits are not counted, a second window reports again.
- [ ] 4.4 Implement the one-time message when `tracePlugin` is missing. Verify with and without the plugin.

## 5. Matrix tests on a real bus (`src/tests/event-cycles.*.test.ts`)

Each test builds `createBus({ trace: createTracer(graphLogger({ onCycle })) })` and asserts the reported path (or no report), the edges of the graph and that the handlers ran the number of times the loop dictates. Run each shape that makes sense with and without `tracePlugin`.

- [ ] 5.1 Emit inside the bus, subscription inside the bus (`event-cycles.handlers.test.ts`): self loop, two-node, three-node and five-node loops, a diamond, a fan-out of 50, a deep chain of 200 (the last three report nothing), `emit` of an action creator and of a string event, the same loop with a loop-breaking condition (reports nothing when the loop ends before `repeats`), `once` listeners that cannot loop, `ctx.on` inside a handler.
- [ ] 5.2 Loops across time and policies (`event-cycles.async.test.ts`): `await` between emits, `setTimeout` with fake timers, a loop through `latest`, `debounce`, `throttle`, `queue`, `leading`, `byKey`, `retry` (a failing step that re-emits), `timeout`, `poll`, `all`, `race`; a cancelled task in the middle of a loop; a loop through an action and a job (with `pending`/`success`/`fail` outcomes).
- [ ] 5.3 Emit from outside, subscription inside (`event-cycles.outside-emit.test.ts`): `bus.emit` at top level, from a timer, from a promise callback, from a signal listener; the first handler loops with itself after one outside emit (chain, reported); the same outside emit 100 times in a second (storm, not a cycle); outside emits that each start a short chain (no cycle, no storm).
- [ ] 5.4 Subscription outside the bus, emit anywhere (`event-cycles.outside-on.test.ts`): `bus.on` at top level, a handler that calls `bus.emit` instead of `ctx.emit` (chain breaks: documented and tested so the behavior is pinned, with a storm only if it repeats fast), a listener that unsubscribes itself, `off` during a loop (the loop stops, nothing more is reported), `bus.once`.
- [ ] 5.5 Modules (`event-cycles.modules.test.ts`): a loop inside one module, a loop across two modules, a module mounted late that closes a loop, a module unmounted in the middle (no report after), a module replaced by name (HMR), `m.use` of a sub-module, a module `setup` that emits at mount, `toMermaid({ group: "module" })` puts each side of the loop in its module.
- [ ] 5.6 Listeners created at run time (`event-cycles.dynamic.test.ts`): a handler that subscribes a new listener each time it runs (growth without a cycle; no false report), a handler that subscribes a listener that emits the first event (a cycle that did not exist at start), a listener added and removed by an `AbortSignal` (`signalPlugin`), a listener added in a handler of the same event, a leak of 1 000 listeners (graph size stays bounded by names).
- [ ] 5.7 Plugin order and options (`event-cycles.plugins.test.ts`): `tracePlugin` before and after other plugins (`matchPlugin`, `scopePlugin`, `signalPlugin`, `contextPlugin`, `actionsPlugin`, `devPlugin`), a predicate subscription (`matchPlugin`) that closes a loop, `sample` below 1 (a chain is whole or absent), `filter` that drops events, two buses with one logger, one bus with two loggers, a logger that is cleared in the middle.
- [ ] 5.8 Add `graphLogger` and a loop probe to `src/tests/plugin-matrix.test.ts` for every order; a probe that fails for an order is a bug.
- [ ] 5.9 A fuzz test in the style of `fuzz.test.ts`: random event graphs with seeded handlers; the logger must report exactly the cycles that a separate reference (Tarjan on the known graph) finds, up to `repeats`, and must never report on an acyclic graph.

## 6. Component tests (`src/react/event-cycles.test.tsx`, happy-dom)

Use `reactPlugin` and the existing patterns of `src/react/plugin.test.ts`. Each test mounts components, checks the reports and the graph, and unmounts.

- [ ] 6.1 `useEmitter` that emits on every render of a component that re-renders on the event it emitted (storm with a count; with `traceId` the report names the emitter).
- [ ] 6.2 A component that subscribes in `useEffect` (`bus.on`) and unsubscribes on cleanup, whose handler emits an event that another handler turns back (a cycle through the component); after unmount nothing is reported.
- [ ] 6.3 A component that subscribes inside an event handler or during render (the wrong place): subscriptions pile up; the test pins what the graph and the reports show, so a regression is seen.
- [ ] 6.4 StrictMode double mount: the loop is reported once, not twice, and a double subscription does not look like a repeat.
- [ ] 6.5 Two components share one bus: component A emits, component B reacts and emits to A (a cycle through two components, no handler on the bus in between); the chain is broken at the component, so assert that it is seen as a storm and that `traceGroupId` joins the roots.
- [ ] 6.6 `useEventState` and `usePolicy` with a loop through a policy; Vue and Svelte get one smoke test each (`vuePlugin`, `sveltePlugin`) that a loop through `useEventRef`/`eventStore` is reported.
- [ ] 6.7 Verify the documented React recipe in `docs/tracing.md` runs as written (a docs-check block plus the test above that mirrors it).

## 7. Integration and docs

- [ ] 7.1 Add a check to `integration/` with the packed package: `nanoeffects/graph` imported by Vite and webpack, tree-shaken when unused (the `createBus` bundle does not contain it), and in the browser harness a loop reaches `console.warn` and Redux DevTools (`devtools: true` with a stubbed extension).
- [ ] 7.2 Add `examples/event-graph.ts`: a small cart with the two-handler loop, the report, `toMermaid()` and `findCycles`-style assertion via `graph.cycles()` (type-checked by `pnpm tsgo`).
- [ ] 7.3 Add the entry to the tables of `docs/package.md` and `docs/plugins.md` (pick a plugin by task), to `llms.txt` (`pnpm llms:check`) and to `tools/docs-site/sidebar.ts` if a page is added; mirror every change in `docs/ru/` (`pnpm docs:check` compares the code blocks).
- [ ] 7.4 Write the `CHANGELOG.md` entry under `Unreleased` (### Added: `nanoeffects/graph`, `TraceEvent.event`), in the style of the release notes.

## 8. Final checks

- [ ] 8.1 Run the production smoke: `pnpm smoke` (Node 18–24 build has no dev dependency on the entry) and `pnpm size`; compare `createBus` with the numbers of 1.2.
- [ ] 8.2 Run `pnpm verify` and fix what it finds.
- [ ] 8.3 Run the fuzz and matrix tests 20 times in a loop (`for i in $(seq 20); do pnpm vitest run src/tests/event-cycles; done`) to check there is no flake from timers or ordering.

## Workflow follow-up

- Archive the change (`/opsx:archive`) after review, so the deltas move into `openspec/specs/`.
