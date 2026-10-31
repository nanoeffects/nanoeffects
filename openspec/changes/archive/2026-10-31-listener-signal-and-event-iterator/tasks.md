# Tasks

## 1. Listener signal in signalPlugin

- [x] 1.1 Add `signal?: AbortSignal` to `ListenerOptions` in `src/core/types.ts` with a doc comment saying it is read by `signalPlugin` and ignored without it; verify `pnpm tsgo` passes and `createBus` bundled alone with rolldown + brotli is byte-for-byte the same size
- [x] 1.2 Wrap `bus.on` and `bus.once` in `src/signal/plugin.ts` (no signal: call the previous method directly; aborted: no-op unsubscribe; else link through `onAbort` and unlink on unsubscribe and after `once` ran); verify with `src/signal/plugin.test.ts` cases for abort, already aborted, `once`, unsubscribe releasing the link, 500 listeners on one signal, and no `signal` leaving `bus.on` untouched
- [x] 1.3 Check that the `on` of a module, `extendBus` and `ctx.on` pass `options` on; fix any that drop `signal`; verify with a test per path
- [x] 1.4 Add the listener probe of `signalPlugin` to `src/tests/plugin-matrix.test.ts`, including `matchPlugin` predicates; verify the matrix passes for every order
- [x] 1.5 Add type tests to `src/tests/types.test.ts` (options accepted with and without the plugin; unknown option still an error); verify `pnpm tsgo`
- [x] 1.6 Measure `dist/signal.js` with `pnpm size`, adjust the `signal (plugin)` limit in `package.json` only if needed, with the numbers in the commit message
- [x] 1.7 Document it in `docs/plugins.md` under `signalPlugin` and in the React page for the `useEffect` case (JS first, each library call commented, names local to the snippet); verify `pnpm docs:check` and `pnpm llms:check`

## 2. Event iterator

- [x] 2.1 Implement `events(source, event, options)` in `src/observable.ts` per design (subscribe at the call, queue with a head index, waiters list, shared `finish`, `buffer` and `overflow` read with `??`) with a doc comment and `@example`; verify with tests for order, listening from the call, `undefined` payload, `break`, abort of a waiting and of a buffered iterator, an aborted signal at the start, a task context, `drop-oldest`, `drop-newest`, a thousand unbounded values, and `return()` twice
- [x] 2.2 Add type tests for the payload type from a name, an action creator and a command, and a wrong event name as a `@ts-expect-error`; verify `pnpm tsgo`
- [x] 2.3 Update `src/tests/exports.test.ts` for the new export of `nanoeffects/observable`, and check `src/tests/architecture.test.ts` still passes; verify `pnpm vitest run src/tests`
- [x] 2.4 Measure `dist/observable.js` with `pnpm size`, adjust its limit only if needed, with the numbers in the commit message
- [x] 2.5 Document it in `docs/observable.md` (the problem, when to use it, what the call does, a JS example with `signal` and `buffer`, the limits) and add a line in `docs/plugins.md`; verify `pnpm docs:check` and `pnpm llms:check`

## 3. Signal-bound context fields

- [x] 3.1 Add the marker symbol in `src/core` (one file, no import into `createBus`) and `fromSignal(make)` in `src/signal`; verify `pnpm tsgo` and that `createBus` bundled alone keeps its size
- [x] 3.2 Make `contextPlugin` define a non-enumerable lazy getter for each marked field, also when the context already has the key (a child of `ctx.run`), and type `ctx.<field>` as the made value; verify with `src/context/plugin.test.ts` cases for the built-once, not-read-not-built, child with its own signal, parent not built by the child, spread / `Object.keys` / tracer not building it, an aborted signal, a clash error, and plain fields unchanged
- [x] 3.3 Add the `fromSignal` probe to `src/tests/plugin-matrix.test.ts` and type tests to `src/tests/types.test.ts`; verify the matrix passes for every order and `pnpm tsgo` passes
- [x] 3.4 Measure a read of a marked field and the cost of a task with and without marked fields (`scripts/` bench as for scopes), record the numbers in `design.md`, and measure `dist/context.js` and `dist/signal.js` with `pnpm size`; raise a limit only with the numbers in the commit
- [x] 3.5 Document `fromSignal` in `docs/context.md` and `docs/plugins.md` (the problem of passing `ctx.signal` by hand, what the call does, the copy-the-context limit); verify `pnpm docs:check` and `pnpm llms:check`

## 4. Recipes for query libraries

- [x] 4.1 Read the current signal and cache APIs of React Query, SWR and RTK Query in their own docs and keep a note of each source in the commit; drop a recipe that cannot be confirmed
- [x] 4.2 Add to `docs/query-libraries.md` a recipe for React Query: an `axios`-style client from `fromSignal`, called in `queryFn` with the library signal through `emit(call, { signal })`; verify `pnpm docs:check` passes for the block and its files (`bus.js`, the action file, the component)
- [x] 4.3 Add a recipe for a live stream into the cache: `events(bus, event, { signal, buffer })` in a `useEffect` that writes `setQueryData` (React Query) and the SWR equivalent, ended by the cleanup abort; verify `pnpm docs:check`
- [x] 4.4 Add a recipe for refreshing queries on a bus event: `bus.on(event, invalidate, { signal })` in a `useEffect`; verify `pnpm docs:check`
- [x] 4.5 Add an RTK Query note (`queryFn` receives a signal) only if 4.1 confirmed it; follow `docs/stores.md` for RTK (`createSlice`, no `nanoeffects/actions` parallel layer); verify `pnpm docs:check` and `pnpm llms:check`
- [x] 4.6 Re-read the page against the Documentation rules (level of the reader, JS first, one example one job, each library call commented, local names); verify with the section gate and that the page's `## On this page` anchors match

## 5. Release notes and full check

- [x] 5.1 Add `### Added` entries for the three features and the recipes under `Unreleased` in `CHANGELOG.md`, one or two lines each with a docs link, no sizes or internals; verify with `node scripts/release-notes.mjs` format by eye
- [x] 5.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; verify all pass and `createBus` is still at its measured size

## Workflow follow-up

- Archive the change with `/opsx:archive` after review; the deltas become `openspec/specs/listener-signal/` and `openspec/specs/event-iterator/`.
