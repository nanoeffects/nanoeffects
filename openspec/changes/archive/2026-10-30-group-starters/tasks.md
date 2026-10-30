# Tasks

## 1. Baseline and type prototype

- [x] 1.1 Write a scratch benchmark (outside the repo) for `all(ctx, { a })` with a starter that resolves at once, run it and keep the numbers; run `pnpm build && pnpm size` and note `effects (all)`
- [x] 1.2 Prototype the overloads of `all` (one argument returns `(child: C) => Promise<…>`, the `ctx` overloads first) and check the nested inference in a scratch type test: `retry` inside `all` inside `race`, and an array form; verify `pnpm tsgo` and the existing `types.test.ts` stay green. If the nested case cannot be inferred, stop and update design.md decision 4

## 2. The one-argument rule

- [x] 2.1 Add the helper that tells the short form (one argument) from a context passed alone and throws the `TypeError` (next to `starter-call.ts`); verify with a unit test that `all(ctx)` throws, starts nothing and starts no timer, and that `all({ signal: (child) => … })` is the short form

## 3. all, allSettled, race as starters

- [x] 3.1 Add the short branch and overloads to `src/effects/all.ts`; verify `all`'s existing tests pass unchanged and a new test shows `race(ctx, { loaded: all({ a: …, b: … }), waited: delay(…) })` gives `loaded` and aborts the delay
- [x] 3.2 Add the same to `src/effects/allSettled.ts`; verify its existing tests pass unchanged and a new test shows the array form inside `all(ctx, [allSettled([…]), …])`
- [x] 3.3 Add the same to `src/effects/race.ts`; verify its existing tests pass unchanged and a new test shows a `race` inside an `all` returns the winner of the inner race
- [x] 3.4 Test the cancellation: the outer race is won by another starter while the inner `all` waits, and the signal of the inner starters is aborted; an inner failure cancels the inner siblings and fails the outer group; a stored group starter serves two outer groups; verify `pnpm vitest run src/effects`
- [x] 3.5 Add cases to `src/tests/types.test.ts`: the nested result types, the array form, a wrong value (`all({ a: 1 })`) as `@ts-expect-error` above the line the checker reports; verify `pnpm tsgo`

## 4. Trace and plugins

- [x] 4.1 Add a test in `src/effects/starter-context.test.ts` with the recorder: a nested group starter gives the same events (parents, `rootId`, `traceGroupId`, phases) as `(child) => all(child, effects)`
- [x] 4.2 Verify `plugin-matrix.test.ts`, `architecture.test.ts` and `exports.test.ts` pass, and that the `race`, `all` and `allSettled` that `effectsPlugin` binds still call the `ctx` form

## 5. Docs

- [x] 5.1 In `docs/effects.md` add one nested group to the paragraph about ready-made starters (the load-two-things-with-a-pause case), with a sentence on why `all(effects)` has no `ctx` and on `all(ctx)` throwing; verify `pnpm docs:check && pnpm llms:check`
- [x] 5.2 Replace `(child) => all(child, …)`, `(child) => allSettled(child, …)` and `(child) => race(child, …)` in groups of `docs/`, `examples/` and the doc comments of `src/`; verify `pnpm tsgo && pnpm check`
- [x] 5.3 Add an `### Added` bullet under `## Unreleased` in `CHANGELOG.md` (one or two lines, link to `docs/effects.md`)

## 6. Measure and verify

- [x] 6.1 Run the benchmark of 1.1 again and compare; run `pnpm build && pnpm size`; raise the `effects (all)` limit in `package.json` only if the growth needs it, and put both numbers in the commit message
- [x] 6.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; all pass

## Workflow follow-up

- Archive the change (`/opsx:archive`) after review; the delta is added to `openspec/specs/effect-starters/spec.md`.
- Do not commit unless the owner asks.
