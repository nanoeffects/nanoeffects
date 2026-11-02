# Proposal

## Why

A trace names a listener, but a reader still cannot jump from `saveNotifier · run done` to the line that registered it. redux-saga prints a saga stack and Effector's tools link units to code; here the only way is to search for the name. Anonymous listeners are worse: they do not appear in the trace at all. A recorded source location (`file:line:column` of the `bus.on` call) closes the gap for the trace, for `describeBus` and for the console.

## What Changes

- `tracePlugin({ source: true })` records, once per registration, where `bus.on` or `bus.once` was called. The location is read from `new Error().stack` and normalised to `file:line:column` for V8, Safari and Firefox; frames of the library are skipped. Without the option nothing is captured (the default), so a project that does not want the cost pays nothing.
- The `run` task of a listener carries it: `TraceEvent` and `TaskInfo` get an optional `source`, set only for a listener registered with the option on. With the option on, an anonymous listener is also reported as a task (it keeps the event as its type) so it has a source.
- `describeBus(bus, { source: true })` appends the location to each name: `"saveName (src/user.ts:12:5)"`.
- `consoleLogger({ source: true })` appends the location to the lines of listeners that have one.
- A missing or unreadable stack gives no `source` and never throws.
- `Tracer.rename` takes an optional third argument, the source, and `renameTask` passes it on. This is a type-level change in `src/core`; the function is not part of `createBus`, and the size of `createBus` is measured before and after.
- Docs: a section in `docs/tracing.md` (English and Russian), a line in `docs/debugging-compared.md`, `CHANGELOG.md`.

Not in this change: source maps (the location is the one the runtime reports; the docs say how to get original lines), the source of an emit, a click-through UI, and the source of a listener that a policy returns.

## Capabilities

### New Capabilities
- `trace-source`: recording the source location of a listener and showing it in the trace and the console logger.

### Modified Capabilities
- `trace-types`: `TraceEvent` and `TaskInfo` get an optional `source`; `Tracer.rename` takes it.
- `bus-listing`: `describeBus` takes an option that adds the location.

## Impact

- `src/trace/` (`plugin.ts`, a new `source.ts`, `tracer.ts`, `console.ts`, `describe.ts`, `listeners.ts`), `src/core/tracer.ts`, `src/core/context.ts`, `src/core/types.ts` (types and one pass-through argument), `docs/tracing.md`, `docs/ru/tracing.md`, `docs/debugging-compared.md` and its Russian page, `CHANGELOG.md`.
- `createBus` size is measured; the `trace` limit rises only as far as measured. The `notrace` build is unchanged: the plugin does nothing without a tracer.
- A logger that copies every field of an event sees a new optional field, only for listeners registered with the option on.
