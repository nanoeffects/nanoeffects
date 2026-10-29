# Design

## Context

`reduxDevtools` (`src/trace/redux.ts`) is a `TraceLogger`: it gets `{ id, parentId?, rootId?, type, effect, phase, payload, error?, traceGroupId? }` and sends `type/effect/phase`. Observed on a real bus (task 1.1):

- Each handler call is a task made by `callHandler`; the task of a listener reports nothing by itself. A plain handler (no policy, no `ctx.run`) therefore leaves no event, and an emit with no listener none either.
- A policy (`latest`, ...) adds a child task of that listener task: `search/latest/start id=2 parent=1 root=1`. Effects below it (`retry`, ...) and their `run` children follow. Today's `depth` counts from the policy task (`0`), and its default `1` also shows the effects.
- One emit with two listeners makes two such tasks, so there is no single root for an emit; a logger cannot rebuild "the emit" from `rootId`.

`tracePlugin` already wraps `bus.emit` (for the call being emitted). Constraints from `AGENTS.md`: `createBus` stays tiny, the `Tracer` contract is not widened for a logger's convenience, a plugin does no work at `bus.use` that a later plugin could miss.

## Goals / Non-Goals

**Goals:**
- A reader who sets `reduxDevtools({ name })` on a bus with `tracePlugin` sees the emits and the errors, and nothing else.
- One option (`policies`) turns on the policy stages, with the phases chosen by the reader.
- No change in the code of `createBus` or in `createTracer`.

**Non-Goals:**
- A fallback that rebuilds emits without `tracePlugin`.
- Sending the emit to the store of the app.
- Renaming the action types of the policy stages (`event/policy/phase` stays, easy to filter by prefix in the extension).

## Decisions

**1. The emit is an event reported by `tracePlugin`.**
The plugin's wrapper of `bus.emit` makes a task with `createTask` (as `emitFrom` does), parent `currentEmitter()`, inside `withCall` so it gets the `traceGroupId` of the call; reports `traceTask(ctx, "emit", "done")`; calls `unlink()`; and then runs the emit as before. The task is a **leaf**: the emit is not made the current emitter, so the `parentId`, `rootId` and `traceGroupId` of every other task stay as they are (specs `trace-group` and the existing probes keep holding). A single `done` is enough: an emit has no duration to measure, and a lone `done` is already a valid shape (`drop`). `"emit"` is added to `EffectName`, a type only.
*Alternative: rebuild the emit in the logger from the first event of a new `rootId`.* Rejected after the check above: plain listeners report nothing, emits without a listener never show, and two listeners make two roots, so the default would be empty for the simplest app.
*Alternative: report from `createBus`.* It would show emits without the plugin but adds work to the path that has to stay tiny. The plugin is where tracing options already live.
*Alternative: the emit task as the parent of the handler tasks.* Changes `parentId` of every task and breaks the `trace-group` scenarios; a leaf avoids it.

**2. Stages by level, not by name.**
Events with `effect: "emit"` bypass `depth`, `starts` and `policies`: they are always sent and never in `running`. Every other event keeps the level it has today (the first task of a listener is level `0`). `policies` filters level `0`; effects below are governed by `depth` and `starts` as before. No list of policy names to go stale when a policy is added; a handler that only calls `ctx.run` (effect `run`, level `0`) is filtered like a policy.

**3. `error` bypasses every filter.**
The `error` phase of a handler task is checked before `policies` and `starts`. A hidden failure is worse than a noisy default. The attempts of `retry` below it keep following `depth`: a failed attempt that is retried is not a failure of the handler.

**4. New defaults.**
`policies` is off, `depth` for effects defaults to `0` (nothing below the first tasks; `1` shows `retry`/`timeout`, as the old default did), `starts` stays `false`. The running state lists only the tasks that are shown, as now.
*Alternative: keep `depth: 1`.* Then `retry` would show by default and break "the default is the emits only". The old default is one option away.

**5. `policies` normalizes to a predicate once.**
`true` → always, an array → a `Set` of phases, a function → itself. The hot path is one call.

## Risks / Trade-offs

- [Without `tracePlugin` the default output is empty] → `docs/tracing.md` shows `.use(tracePlugin())` in the devtools recipe and says so in one line; `policies: true` still works without it; the logger prints one `console.warn` when a handler task ends with no emit before it (it can also fire when `sample` or `filter` cut the emits, which is why it says only what it saw).
- [One extra task and event per emit with the plugin] → the emit is made with `tracer.task` and `tracer.report` and no context (no `AbortController`): about 60 ns more per emit than a bus with a tracer, measured with 300 000 emits of one plain listener (a first version through `createTask` cost about 450 ns). `sample` and `filter` of `createTracer` cut it in the log, not in the work.
- [A job emits its outcomes, so one call is several `emit` events] → accepted and written in `docs/tracing.md`; they are emits.
- [`consoleLogger` and `performanceLogger` also show the new events with the plugin] → accepted: a line `search · emit done` and one mark per emit; the specs of those loggers say nothing against it. Noted in the changelog.
- [The default output of `reduxDevtools` changes] → **BREAKING**, written in `CHANGELOG.md` with the way back: `policies: true, depth: 1`.
- [Existing tests assert `type/effect/phase` of every task] → they pass `policies: true, starts: true, depth: Infinity`, so they keep covering the stages; new tests cover the default.
- [Tests that count ids or events with `tracePlugin`] → updated where they fail; the other events must not change (a scenario in the spec).

## Migration Plan

Release note in `Unreleased`: the default shows emits and errors only (add `bus.use(tracePlugin())` to see the emits); for the old lines, `reduxDevtools({ policies: true, depth: 1 })`. No data or config to move. Rollback is a revert of `src/trace/redux.ts` and the wrapper in `src/trace/plugin.ts`.

## Open Questions

- Whether `performanceLogger` should skip `emit` events (a mark per emit may be much in a busy app). Settled by looking at the playground; the specs allow either.
