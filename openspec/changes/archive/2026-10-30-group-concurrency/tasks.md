# Tasks

## 1. Baseline

- [x] 1.1 Run the scratch benchmark `bench-group.mjs` and `pnpm build && pnpm size` and note `all call` and `effects (all)`

## 2. The scheduler

- [x] 2.1 Add `startLimited` beside `startStarters` in `src/effects/run.ts` and let `runGroup` use it for a finite limit; verify with a unit test that `{ concurrency: 2 }` keeps at most two starters in flight over five and that the order of results is unchanged
- [x] 2.2 Make the cancel flag stop the next start; verify that `all` with a failure calls no waiting starter and that an abort of `ctx` does the same for `all` and `allSettled`

## 3. Validation and the call

- [x] 3.1 Add the check and the three-argument branch to `groupOrStarter`; verify `0`, `-1`, `NaN`, `1.5` throw a `RangeError` with no starter called and no trace event, and that `Infinity`, `null` and a missing option mean no limit
- [x] 3.2 Add the third argument and overloads to `all.ts` and `allSettled.ts` and export `GroupOptions` from `src/effects/index.ts`; verify the existing tests pass unchanged and `allSettled` goes on after a failure

## 4. Trace and types

- [x] 4.1 Add recorder tests in `src/effects/`: one group `start` and later `run` events with `{ concurrency: 1 }`, and the same shape as without the option for a large limit; verify `pnpm vitest run src/effects`
- [x] 4.2 Add cases to `src/tests/types.test.ts`: the third argument for `all` and `allSettled` keeps the result types, a wrong option (`{ concurrency: "5" }`) is an error above the line the checker reports; verify `pnpm tsgo`
- [x] 4.3 Verify `plugin-matrix.test.ts`, `architecture.test.ts` and `exports.test.ts` pass and `effectsPlugin`'s bound `all` and `allSettled` still pass the options on

## 5. Docs

- [x] 5.1 In `docs/effects.md` add one example with `concurrency`, the rules for a failure and an abort, why `race` has none, and the wrapper for a nested group; verify `pnpm docs:check && pnpm llms:check`
- [x] 5.2 Add an `### Added` bullet under `## Unreleased` in `CHANGELOG.md` (one or two lines, link to `docs/effects.md`)

## 6. Measure and verify

- [x] 6.1 Run the benchmark of 1.1 again and compare; run `pnpm build && pnpm size`; raise the `effects (all)` limit only if needed and put both numbers in the commit message
- [x] 6.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; all pass

## Workflow follow-up

- Archive the change (`/opsx:archive`) after review; the delta is added to `openspec/specs/starter-context/spec.md`.
- Do not commit unless the owner asks.
