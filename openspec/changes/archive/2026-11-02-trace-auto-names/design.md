# Design

## Context

`tracePlugin` names a listener by `traceId`, else `handler.name` (`nameOf` in `src/trace/plugin.ts`). With `source: true` it reads the place of the call once at registration (`sourceFrom(takeCaller(), 2)`) and, for a listener with no name, uses the event key as the name (`shownName`) so the listener appears in the trace. See proposal.md for the problem: the event key is shared by all such listeners.

## Goals / Non-Goals

**Goals:**
- Distinct nodes for distinct anonymous listeners, with the existing `source` stack work and nothing new on the hot path.

**Non-Goals:**
- A static graph from source code; a compiler plugin for variable names; a new option.
- Names without `source: true`: the stack is read only when asked for.

## Decisions

- **Name = `event#n`, change `shownName` only.** The plugin keeps a counter for each event key; `wrapperOf` runs once for a registration, so it takes the next number there and `shownName` returns `` `${key}#${n}` `` for a string key. No new code on `emit`, nothing in `src/core`, so `createBus` is untouched. Alternatives: the location as the name (`event (file:line:column)`) was the first draft. Rejected: the line moves when code above it changes, so the name differs between builds and saved graphs stop merging. A random id was rejected as well: it differs on every run. The place stays in `source`, where a log line or a report finds it.
- **The counter is not reused.** A removed listener leaves a gap, so a name never means two listeners in one run. The order of registration is what the number follows; it is stable between runs of one program, and it changes only when `bus.on` calls are reordered or added.
- **Tied to `source: true`, no new option.** An anonymous listener is reported only with this option today; a second switch would be a concept for one use case. Alternative: number anonymous listeners always. Rejected: it makes listeners that nobody named appear in every trace, which is a change for every user.
- **A named listener is not touched.** `traceId` and `handler.name` win, so adding `source: true` never renames what a user named.

## Risks / Trade-offs

- [Adding or reordering `bus.on` calls renumbers the anonymous listeners of an event] -> Documented next to `source`; give a `traceId` to a listener that must keep its node across builds and merged snapshots.
- [`event#2` does not say where the listener is] -> The `source` field and `consoleLogger({ source: true })` show the place; the docs say so.
- [Saved snapshots of the old name no longer merge for these nodes] -> Noted in the CHANGELOG.
