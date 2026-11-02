## 1. timingLogger

- [x] 1.1 Add `src/trace/timing.ts`: `timingLogger({ now?, capacity? })` with `durations`, `pending()`, `clear()`; key by id and effect; ignore a closing phase with no start.
- [x] 1.2 Tests next to it (fake timers and injected `now`): done, error, cancel, drop, no start, first closing phase wins, capacity, clear, pending after a normal bus run with `latest` and `retry`.
- [x] 1.3 Export from `src/trace/index.ts` with its option and entry types.

## 2. Task index and recorder

- [x] 2.1 Add `src/trace/task-index.ts`: a `task` hook that maps a ref to an id and an id to `{ type, parentId, source, traceGroupId }`, updates on rename, evicts the oldest over a limit.
- [x] 2.2 `createTraceRecorder`: use it (limit = `capacity`), expose `tasks`, empty it in `clear()`, leave `toJSON()` as it is.
- [x] 2.3 Tests: silent listener known, rename, capacity bounds tasks, clear, `toJSON` unchanged.

## 3. chainOf and the consoleLogger option

- [x] 3.1 `src/trace/chain.ts`: `chainOf(source, id)` for a recorder or a list; steps without events have no `effect` or `phase`; safe on a missing parent and a cycle. Export it with its types from `src/trace/index.ts`.
- [x] 3.2 Tests: chain of three from a list, root, unknown parent, unknown id, latest phase, cycle, input not changed, and a real bus (`ctx.emit` in a listener, a failing handler) through a recorder.
- [x] 3.3 `consoleLogger({ chain })`: use the task index (limit 1000); append the path to `error` lines only.
- [x] 3.4 Tests: nested error through a silent listener, default unchanged, bounded at 1000.

## 4. Docs

- [x] 4.1 `docs/tracing.md`: the test recipe `createTracer([recorder, timing])`, a section "Measure time and find open tasks" (`timingLogger`), a section "Find the cause of an error" (`chainOf`, `chain: true`), and a short "Stop on an event" example with a custom logger and `debugger`; JS first, each library call commented; update `## On this page`.
- [x] 4.2 Same in `docs/ru/tracing.md` (read RUSSIAN-DOCS.md first); code blocks match the English ones.
- [x] 4.3 Update the line in the recorder docs that says an event has no time to point at `timingLogger`; update `docs/package.md` or `docs/plugins.md` tables only if they list trace loggers.
- [x] 4.4 `CHANGELOG.md` under `Unreleased` (`### Added`).

## 5. Verify

- [x] 5.1 Check the `trace` limit in `package.json` with `pnpm size`.
- [x] 5.2 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`.
