## Why

A trace event has no time, and the trace has no ready answer to "what is still running" or "what chain led to this error". The order of events is there, but the owner of an app cannot answer which handler is slow, how long a request lived before `cancel`, whether a test left a task open, or which emit caused a failure. The data for all three is already in the events (`phase`, `id`, `parentId`, `rootId`, `source`); only the readers are missing.

## What Changes

- Add `timingLogger` to `nanoeffects/trace`: a trace logger that stamps each event on receipt and keeps the duration of every task that closed (`start` → `done|error|cancel|drop`), readable as data.
- The same logger answers `pending()`: the tasks that started and have not closed, so a test can assert that nothing is left after unmount.
- Add `chainOf(source, id)` to `nanoeffects/trace`: the path from the root to a task, with the `type`, `effect`, `phase`, `source` and `traceGroupId` of each step. `source` is a recorder (listeners that report nothing are steps too) or a plain list of events.
- `createTraceRecorder` remembers tasks from the `task` hook as `recorder.tasks`, so the path does not break at a listener.
- `consoleLogger` gets an option `chain` that appends that path to the line of an `error` event.
- Docs only, no spec: a short "stop on an event" example (a custom logger with `debugger`) in `docs/tracing.md` and `docs/ru/tracing.md`, plus a section for the new tools.
- No change to `src/core`, `createBus`, `TraceEvent` or `Tracer`. No new entry.

## Capabilities

### New Capabilities
- `trace-timing`: durations of closed tasks and the list of open ones, from a logger.
- `trace-chain`: the causal path of a task, and its use in `consoleLogger`.

### Modified Capabilities
- `trace-recorder`: remembers the tasks that report nothing.

## Impact

- `src/trace/` (new `timing.ts`, `chain.ts`; `console.ts`; `index.ts` re-exports), tests next to them.
- `docs/tracing.md`, `docs/ru/tracing.md`, `llms.txt` (no new page, so only if a description changes), `CHANGELOG.md` under `Unreleased`.
- `size-limit`: the `trace` entry grows; check its limit in `package.json`.
