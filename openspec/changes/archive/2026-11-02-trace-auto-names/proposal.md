## Why

An inline listener (`bus.on("cart/added", () => ...)`) has no `traceId` and no function name. With `tracePlugin({ source: true })` it is reported under the name of its event, so two anonymous listeners on one event are one node in `graphLogger`, and a chain or a cycle through them cannot say which one it passed.

## What Changes

- With `tracePlugin({ source: true })`, a listener that has no `traceId` and whose function has no name is named `<event>#<n>` instead of `<event>` alone, where `n` counts such listeners on that event from 1 in the order they were registered. Two inline listeners on one event become two nodes, and a name does not change when code above them moves. The place stays in the `source` field.
- A listener with a `traceId` or a function name keeps that name. Without `source: true` nothing changes: an anonymous listener stays as it is.
- No new option, no new export, no change to `createBus`.
- Docs (`docs/tracing.md`, its Russian page) and `CHANGELOG.md` say it.

Out of scope: a static graph from source code (deferred until there is demand), a Babel/SWC plugin that names listeners by their variable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `trace-source`: the requirement "An anonymous listener is reported with its source" names the task by the event and its number, not by the event alone.

## Impact

- `src/trace/plugin.ts` (`shownName`), its tests, `src/trace/source-wrappers.test.ts` if a name is asserted there.
- `docs/tracing.md`, `docs/ru/tracing.md`, `CHANGELOG.md` (Unreleased).
- Graph and chain output of a project that uses `source: true`: the node name of an anonymous listener changes from `event` to `event#n`. Saved snapshots from before the change do not merge with new ones for these nodes.
