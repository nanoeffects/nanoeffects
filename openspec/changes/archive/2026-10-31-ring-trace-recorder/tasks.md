# Tasks

## 1. Recorder with a capacity

- [x] 1.1 Write the failing tests first in `src/trace/loggers.test.ts` (or a new `src/trace/recorder.test.ts`, with the existing recorder tests moved there): every scenario of `specs/trace-recorder/spec.md`, including the invalid `capacity` values, a capacity of one, ten events on a capacity of three, a snapshot that later events do not change, `clear()` after a wrap, and a real bus through `createTracer`. Names without abbreviations. Verify: the new tests fail against the current code and the existing ones pass.
- [x] 1.2 Change `createTraceRecorder` in `src/trace/recorder.ts` to take `{ capacity }` and make `events` a getter: unbounded mode keeps one array and `clear()` sets its `length` to 0; bounded mode keeps a fixed buffer, a write index and a size, adds in O(1) and builds the array oldest first on read. Read the option with `??` and a positive-integer check. Update the doc comment with an `@example` for both modes. Verify: `pnpm vitest run src/trace` passes, and `pnpm tsgo` and `pnpm check` are clean (the `Recorder` type keeps `events` as a read-only array).
- [x] 1.3 Run the whole suite and the type check for users of `recorder.events` (`src/tests/test-helpers.ts`, `src/tests/exports.test.ts`, `integration/`). Verify: `pnpm vitest run` and `pnpm tsgo` pass with no change to those files; if one must change, the reason goes in `design.md` first.

## 2. Measure

- [x] 2.1 Measure `nanoeffects/trace` before and after: bundle the entry (or `createTraceRecorder` alone) with rolldown and compress with brotli, as for `createBus`. Write both numbers in `design.md` under Risks. Decide, and write down, whether the entry gets a `size-limit` item (the open question). Verify: `pnpm build && pnpm size` pass, and no existing limit moved.
- [x] 2.2 Check that the hot path did not slow in the unbounded mode: time one million calls of the recorder before and after with a short script in the scratchpad (not committed). Verify: the numbers are in `design.md`, and the unbounded mode is not slower beyond noise.

## 3. Docs and changelog

- [x] 3.1 In `docs/tracing.md`, change the `createTraceRecorder()` row of the logger table to say "for tests, or with `{ capacity }` the last N events", and add a short section "Keep the last events for an incident" at level F: the problem (a growing recorder holds the whole session), the call (`createTraceRecorder({ capacity: 500 })`), a JS example that makes the ring, reads `recorder.events` in an error handler, drops `payload` and sends the rest, one comment per library call, and each name defined in the snippet. The section states: payload can hold private data and the library does not redact; there is no timestamp; an unknown `parentId` means a root; `sample` cuts what reaches the ring; a bounded `events` read is a snapshot. Verify: `pnpm docs:check` and `pnpm llms:check` pass, and the page's table of contents lists the new heading with a correct anchor.
- [x] 3.2 Add a line to `CHANGELOG.md` under `Unreleased` / `Added`: `createTraceRecorder({ capacity })` keeps only the last N events, to send them when something goes wrong, with a link to the new section. Verify: `node scripts/release-notes.mjs` renders the section without error if a version heading is present, or the line matches the style of the entries around it.

## 4. Final check

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build && pnpm size`. Verify: all pass; then archive the change with `/opsx:archive`.

## Workflow follow-up

- Do not commit or stage unless the owner asks.
- Archive the change after the owner accepts the result, so the delta moves into `openspec/specs/trace-recorder/`.
