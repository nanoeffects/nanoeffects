# Design

## Context

`src/trace/recorder.ts` is 25 lines: an array, a logger that pushes into it, and `clear` that sets `length = 0`. `Recorder.events` is a plain field, and tests read it directly (`harness.recorder.events`, and `const { events } = recorder` followed by `clear()` and `expect(recorder.events).toBe(events)`). The recorder is a `TraceLogger`, so it needs nothing from the core. `nanoeffects/trace` has no entry in `size-limit` today. See proposal.md for the use case.

Constraints: no change to `src/core`; the recorder must not slow the unbounded case that tests use; no new public name.

## Goals / Non-Goals

**Goals:**
- One function serves tests (no argument) and a running app (`{ capacity }`).
- Adding an event is O(1) and, once the buffer is full, allocates nothing.
- Existing code that reads `recorder.events`, or keeps it across `clear()`, keeps working in the unbounded case.

**Non-Goals:**
- A timestamp on `TraceEvent` or on the recorder (`performance.now()` can be added by a wrapping logger in the app).
- Redaction, serialization or sending: the events hold `payload` and `error` as they are, and what to cut is a decision of the app.
- Keeping more when something goes wrong (for example "flush on `error`", or a bigger capacity for an unsampled root). A logger can do it; the recorder stays a buffer.
- A graph or Mermaid export of the events.

## Decisions

**One function with an option, not `createRingRecorder`.** A second function would repeat `events`, `clear` and the `Recorder` type, and the surface does not grow for one use case (AGENTS.md). With an option, the type is one `Recorder`, and a person finds the ring where they already look for a recorder. Alternative: a separate entry; rejected for the same reason.

**`events` has two modes.** Unbounded mode keeps today's contract exactly: `events` is a plain field holding one array, the same object each time, and `clear()` sets its `length` to 0. Only a bounded recorder turns `events` into a getter (`Object.defineProperty` on the logger), so the common case pays nothing. Bounded mode keeps a fixed buffer plus a write index and a size, and the getter builds the array oldest first. Alternative: a bounded recorder that keeps a growing array and calls `shift()` when full; rejected because `shift` is O(n) per event once full, and the recorder runs on the hot path of every task. Alternative: a method `snapshot()` next to a field `events`; rejected because it makes one name mean two things by mode, and the docs would have to explain which to read.

**The getter of a bounded recorder returns a new array on each read.** The read is for an incident, not for the hot path, so the cost of building the array is paid when it is wanted. A caller can keep the result, change it, or send it, and it cannot disturb the buffer. The price is that `const { events } = recorder` is a snapshot in bounded mode and a live view in unbounded mode; the docs say so, and the spec has a scenario for each.

**`capacity` that is not a positive integer means unbounded.** `0`, a negative number, `NaN`, `null` and `1.5` all fall back to the default, read with `??` and a check rather than with destructuring defaults (AGENTS.md: options that are `null`). Alternative: throw on a bad `capacity`; rejected because a typo in a diagnostics option should not break an app. Alternative: `capacity: Infinity` as the way to say unbounded; it works without special code (`Infinity` is not an integer, so it falls back), and needs no mention.

**Do not store the dangling parent.** After the ring overwrites an event, the `parentId` of a later one can point at an id that is gone. The recorder keeps events as they are and does not repair or drop them: a reader treats an unknown `parentId` as a root. This is stated in the docs because the first thing a person does with the events is build a tree.

**Sampling is the caller's.** `createTracer` decides per root task, so a low `sample` fills the buffer slowly and an incident may find it thin. The recorder does not look at it. The docs recipe shows `sample: 1` for the tracer that feeds the ring, and `filter` to leave out noisy events, because that is where the volume is cut.

## Risks / Trade-offs

- [`payload` holds private data (input, tokens, personal text) and a person sends the ring to a server] → The docs recipe says it first, shows a `map` that keeps `type`, `phase`, `effect`, `id`, `parentId` and drops `payload`, and states that the library does not redact.
- [The getter changes `events` from a field to an accessor; code that spreads or `Object.assign`s a recorder, or that replaces `events`, behaves differently] → In the unbounded mode the value is the same array; assigning to `events` was never part of the type (`readonly`). The tests in `src/` and `integration/` are the check.
- [Adding an event in the unbounded mode gets slower] → Timed one million calls, median of seven rounds, in two runs: before 14.1 and 16.4 ms, after 15.3 ms in both, so the difference is noise. With `capacity: 500` the same million calls take 6.0 ms, because nothing grows.
- [A bounded `events` read allocates, and a test that reads it in a loop pays for it] → The tests of this library use the unbounded mode; the docs say that a bounded read is for taking a snapshot.
- [The size of `nanoeffects/trace` grows] → Measured with esbuild (minified, brotli) on `createTraceRecorder` alone: 98 B before, 257 B after (+159 B). `pnpm build && pnpm size` pass and no existing limit moved (`createBus` is not touched). There is no limit on the trace entry, and one is not added: it holds the loggers and `createTracer`, the number is not the point of this entry, and a new guard would be a decision of its own.
- [No time in an event, so an incident shows the order but not the duration] → Stated in the docs; a logger that stamps a time and then calls the recorder is the way, and a timestamp on `TraceEvent` is its own change.

## Open Questions

None. `nanoeffects/trace` gets no `size-limit` entry in this change (see Risks).
