# Proposal

## Why

`createTraceRecorder()` keeps every event in an array that only grows, so it is for tests. A production app cannot use it: after an hour it holds the whole session. A person who wants "the last few hundred events before the error, sent to an endpoint" has to write the buffer by hand, and gets the order of a wrapped buffer wrong easily.

A cap on the number of events turns the same recorder into a ring buffer. It needs no new concept: the logger contract is unchanged and the core does not know about it.

## What Changes

- `createTraceRecorder({ capacity })` takes an optional `capacity`. With it the recorder keeps only the last `capacity` events, and adding one is O(1) with no allocation once the buffer is full.
- `recorder.events` is a getter. Without `capacity` it returns the same array as today (a live, growing array, the same object on every read, kept by `clear()`). With `capacity` it returns the events oldest first, in a new array on each read.
- `createTraceRecorder()` with no argument behaves as before. No new function and no new entry (`createRingRecorder` is not added).
- `capacity` is read once, when the recorder is made. A `capacity` that is not a positive integer (`0`, negative, `NaN`, `null`) means unbounded, as `null` options fall back to defaults elsewhere.
- The docs say what the buffer keeps, what it does not (no timestamp), and warn that `payload` can hold private data. Redacting and sending the events stay in the app.

## Capabilities

### New Capabilities
- `trace-recorder`: what `createTraceRecorder` keeps and in which order, with and without a `capacity`, and what `clear()` and `events` guarantee.

### Modified Capabilities

## Impact

- Code: `src/trace/recorder.ts`, its tests in `src/trace/loggers.test.ts`.
- Public API: one optional argument of an existing function in `nanoeffects/trace`; the type `Recorder` keeps its fields (`events` becomes a getter, type unchanged).
- Docs: `docs/tracing.md` (logger table and a short recipe "Keep the last events for an incident"), `llms.txt` only if a page is added (none is), `CHANGELOG.md` under `Unreleased` / `Added`.
- Size: `nanoeffects/trace` has no `size-limit` entry today. The change measures the entry before and after; core (`createBus`, 1296 B of 1.3 kB) is not touched.
- Out of scope: a timestamp on `TraceEvent`, redaction, sending to an endpoint, sampling on error ("keep the buffer, trace everything"), and a graph export of the events.
