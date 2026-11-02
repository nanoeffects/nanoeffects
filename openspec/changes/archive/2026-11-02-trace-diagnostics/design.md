## Context

Events carry `id`, `parentId`, `rootId`, `phase`, `source`, `traceGroupId` but no time (`recorder` doc says so). A logger is called synchronously when a phase is reported, so the time it reads on receipt is the time of the phase. `src/core` is at its size limit and `TraceEvent` is a contract that loggers and the Redux adapter depend on. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Durations, open tasks and error paths as data, without touching `src/core`.
- Usable in a test, with a fake clock.

**Non-Goals:**
- A `t` field on `TraceEvent` (stays a possible later step).
- Replay of recorded inputs, a UI, a static graph.
- A breakpoint API: the docs show it in five lines of a custom logger.

## Decisions

**1. A separate logger, `timingLogger`, not methods of the recorder.** The recorder is "events as they came" and is used with `capacity`; adding time to it would either change the shape of its events or keep a second parallel list. A logger that keeps only what it needs (`start` times of open tasks, a list of closed ones) is smaller and can be used without the recorder. Alternative: `recorder.durations()`. Rejected: the recorder has no time, so it would need a clock and an extra stamp per event, which costs memory for every user of `capacity`.

**2. Durations and open tasks live in one logger.** Both are the same pairing of `start` with a closing phase: `pending()` is the map of `start`s that have no pair. Two loggers would repeat the map. The key is task `id` plus `effect`, because one task can report phases of more than one effect.

**3. `chainOf` takes a recorder or a list of events.** A listener that reports nothing is the parent of what it emits with `ctx.emit`, and it exists only in the `task` hook of a logger (`TaskInfo`); its id is in `parentId` and `rootId` of the events below it. Events alone lose that step, so the path of a failure would end at the failed task. The recorder therefore remembers tasks from `task` in `recorder.tasks`, and `chainOf(recorder, id)` uses both. A plain list still works (a file read back, a snapshot) and gives the path of the tasks that have events. Alternative: events only. Rejected: it fails in the main case, a `ctx.emit` in a listener. Alternative: the tracer keeps the tree. Rejected: `createBus` and `Tracer` stay unchanged.

**4. The time comes from the logger, with `now` injectable.** Default is `performance.now()` when it exists and `Date.now()` otherwise; tests pass a function over `vi.advanceTimersByTime`. `testing` entry is not needed: fake timers already move both clocks.

**5. One small index of tasks, used by the recorder and by `consoleLogger({ chain })`.** It maps a `ref` to an id (a `WeakMap`) and an id to `{ type, parentId, source, traceGroupId }` (a `Map` with a limit). The recorder uses its `capacity` as the limit and no limit without one; `consoleLogger` uses 1000. Tasks that report nothing never close, so a limit is the only bound; evicting the oldest first is right because a chain needs recent ancestors.

**6. `pending()` is not cut by `capacity`.** A leak shows up as a growing list, and cutting it would hide the very thing it is for.

## Risks / Trade-offs

- [A task whose `start` was filtered or sampled out never pairs] → documented: the logger sees what the tracer lets through; a closing event with no start is ignored.
- [A task that never closes stays in the map] → that is the answer `pending()` gives; document `clear()` for tests.
- [The recorder keeps one more map] → it is bounded by the same `capacity`; without one it is unbounded like `events`, which is for tests.
- [The `trace` entry grows] → check the `size-limit` of the entry; the code is two small files.
- [Time is read on receipt, so a logger behind a slow logger sees skew] → loggers are synchronous and order-preserving; note it in the docs.

## Migration Plan

Additive, no migration. Rollback is removing the exports.

## Open Questions

None that change the specs.
