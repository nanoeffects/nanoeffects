# Tasks

## 1. Shared groundwork

- [x] 1.1 Add `"dedupe" | "distinct" | "rateLimit" | "batch"` to `EffectName` in `src/core/types.ts`; verify `pnpm tsgo` and `src/tests/architecture.test.ts` pass and `createBus` stays within its size limit (`pnpm build && pnpm size`).
- [x] 1.2 Record the `dist/policies.js` size (brotli) before any policy is added, as the baseline for the later limit change; verify the number is written in the commit notes of group 6.

## 2. `dedupe`

- [x] 2.1 Implement `src/policies/dedupe.ts` on `keyed()` and `formOf` (key defaults to the payload, shared promise, owner handed on after its abort, lifecycle through `startCall`, `dropCall`, `doneCall`, `endCall`), with a doc comment and `@example`; verify it type-checks with `pnpm tsgo` and passes `pnpm check`.
- [x] 2.2 Write `src/policies/dedupe.test.ts` (no abbreviations in names) for every scenario of `specs/policy-dedupe`: sharing, different payloads, `key`, shared error, forgetting after a value and after an error, follower abort, owner abort with a live follower, everyone aborts, an aborted call, job lifecycle, curried form, `withPolicy`; verify `pnpm vitest run src/policies/dedupe.test.ts` passes.
- [x] 2.3 Export `dedupe` and `DedupeOptions` from `src/policies/index.ts`; extend `src/tests/exports.test.ts` and add inference and `@ts-expect-error` cases to `src/tests/types.test.ts`; verify `pnpm tsgo` and those tests pass.
- [x] 2.4 Write the `dedupe` docs: table row and entry in `docs/policies.md`, one recipe in `docs/recipes.md` (the same user asked for by several components; says "reads, not writes"), the same in `docs/ru/policies.md` and `docs/ru/recipes.md`; verify `pnpm docs:check` passes.

## 3. `distinct`

- [x] 3.1 Implement `src/policies/distinct.ts` (remember from the start of the run, forget on rejection or abort, `Object.is` or `equals`, skipped call returns `undefined`, synchronous `fn` stays synchronous), with a doc comment and `@example`; verify `pnpm tsgo` and `pnpm check` pass.
- [x] 3.2 Write `src/policies/distinct.test.ts` for every scenario of `specs/policy-distinct`: repeats, change in between, `equals`, no comparer on objects, retry after an error, repeat while running, retry after an abort, per-key memory, synchronous result, job lifecycle, `withPolicy`; verify the file passes.
- [x] 3.3 Export `distinct` and `DistinctOptions`; extend `exports.test.ts` and `types.test.ts`; verify `pnpm tsgo` and those tests pass.
- [x] 3.4 Write the `distinct` docs: table row and entry in `docs/policies.md` (bounded keys are said next to `key`), a short recipe (a repeated save), the Russian pages; verify `pnpm docs:check` passes.

## 4. `rateLimit`

- [x] 4.1 Implement `src/policies/rate-limit.ts` (start times plus a FIFO of waiting calls, one `setTimer` per key, `overflow: "wait" | "drop"`, key dropped when both are empty, odd arguments made safe), with a doc comment and `@example`; verify `pnpm tsgo` and `pnpm check` pass.
- [x] 4.2 Write `src/policies/rate-limit.test.ts` with fake timers for every scenario of `specs/policy-rate-limit`: under the limit, over the limit, the sliding window at 0, 600 and 700 ms, order, `"drop"`, abort while waiting and after the start, slow runs, per-key windows, no timer left on an idle key, `limit` 0, `ms` 0 and `Infinity`, job lifecycle, curried form, `withPolicy`; verify the file passes.
- [x] 4.3 Export `rateLimit` and `RateLimitOptions`; extend `exports.test.ts` and `types.test.ts`; verify `pnpm tsgo` and those tests pass.
- [x] 4.4 Write the `rateLimit` docs: table row and entry (how it differs from `throttle` and `queue`, and how to combine it with `queue({ concurrency })`), a recipe (an API quota), the Russian pages; verify `pnpm docs:check` passes.

## 5. `batch`

- [x] 5.1 Implement `src/policies/batch.ts` (fixed window from the first call, `maxSize`, `Task<P[], E, R>` turned into `Task<P, E, Promise<Awaited<R> | undefined>>`, owner is the first live caller, no restart, per-key batches, key dropped after the run settles), with a doc comment and `@example`; verify `pnpm tsgo` and `pnpm check` pass.
- [x] 5.2 Write `src/policies/batch.test.ts` with fake timers for every scenario of `specs/policy-batch`: one window, a window that does not move, one call, `maxSize` and its timer, shared value and shared error, abort while collecting (and the empty batch leaving no timer), abort after the send, owner abort during the run, a first caller that left earlier, per-key batches, job lifecycle, `withPolicy`; verify the file passes.
- [x] 5.3 Export `batch` and `BatchOptions`; extend `exports.test.ts` and `types.test.ts` (including that `fn` gets `P[]` and a wrong payload type fails); verify `pnpm tsgo` and those tests pass.
- [x] 5.4 Write the `batch` docs: table row and entry (says that every caller gets the same value and where a per-caller result would come from), a recipe (analytics events), the Russian pages; verify `pnpm docs:check` passes.

## 6. Cross-cutting checks and release notes

- [x] 6.1 Add installers and probes for the four policies to `src/tests/plugin-matrix.test.ts` (a policy used on a bus with each plugin in any order) and lifecycle cases for the four to the job tests that cover `policy-lifecycle`; verify `pnpm vitest run src/tests` passes.
- [x] 6.2 Add `usePolicy` cases for `dedupe` and `batch` in the React tests (the state survives a re-render); verify `pnpm vitest run src/react` passes.
- [x] 6.3 Measure `dist/policies.js` after `pnpm build` and raise the `policies (all)` limit in `package.json` to the measured size plus a small margin; verify `pnpm size` passes and no other limit changed.
- [x] 6.4 Update `docs/package.md` (the `nanoeffects/policies` row), `docs/plugins.md` if it lists policies, `llms.txt` (the Policies line) and its Russian counterparts; verify `pnpm llms:check` and `pnpm docs:check` pass.
- [x] 6.5 Add an `Added` entry for the four policies under `Unreleased` in `CHANGELOG.md`, written for a release page (one or two lines, a link to `docs/policies.md`, no sizes); verify `node scripts/release-notes.mjs` can read it.
- [x] 6.6 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build` and then `pnpm verify`; verify all pass.

## 7. Interaction, marble and stress tests

- [x] 7.1 Add `src/policies/policies-interaction.test.ts`: every useful pair of policies composed in both orders (`dedupe` / `distinct` / `rateLimit` / `batch` each with `latest`, `leading`, `debounce`, `throttle`, `queue` and with each other), asserting results, call counts, abort propagation, and that no timer or state is left; verify the file passes and each found bug has a failing-first regression test.
- [x] 7.2 Add `src/testing/policies-new.test.ts`: marble diagrams (one frame is 10 ms) for `dedupe`, `distinct`, `rateLimit` and `batch`, including at least one diagram per composition from 7.1 that is easier to read as a diagram; verify the diagrams are checked against the spec scenarios by hand before they are frozen, and the file passes.
- [x] 7.3 Add `src/tests/policies-new.fuzz.test.ts`: seeded random mixes of the four policies and the five old ones with random payloads, keys, delays, errors and aborts (as `src/tests/fuzz.test.ts` does), checking invariants: every promise settles, a job gets one `pending` and one closing outcome per started run, `fn` never runs more often than the policy allows (`rateLimit` window, `batch` size, `dedupe` overlap), no timer is left (`vi.getTimerCount()` is 0), nothing is left running, and the trace is consistent; run at least 300 seeds; verify it passes and that a deliberately broken policy makes it fail.
- [x] 7.4 Add a heavy case for each policy (50 000 keys or 10 000 queued calls, as the store tests do) and a `lodash`-style model check where a simple reference model exists (`distinct` against `distinctUntilChanged` written in the test, `rateLimit` against a naive window counter, `batch` against a naive grouping); verify they pass within a few seconds.

## Workflow follow-up

- Archive the change (`/opsx:archive`) after review so the four capabilities and the lifecycle requirement move into `openspec/specs/`.
- Do not commit, push or stage unless the owner asks.
