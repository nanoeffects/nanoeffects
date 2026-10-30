# Tasks

## 1. Baseline

- [x] 1.1 Write a scratch benchmark (outside the repo, not committed) for `delay(ctx, 0)` and `race(ctx, { a: take(child, event) })`, run it, and keep the numbers for the commit message
- [x] 1.2 Run `pnpm build && pnpm size` and note the `effects (all)` size before the change

## 2. delay as a starter

- [x] 2.1 Add the shared check of the first argument (an object that is not a function is a context) and the short overload to `src/utils/delay.ts`; verify `delay(ctx, ms)` tests pass unchanged and `delay(1000)` returns a starter that starts no timer until called
- [x] 2.2 Test in `src/utils/` next to `delay`: a stored starter used in two `race` calls waits twice independently; `ms` as a function is read at each call; `delay({}, 10)` still returns a promise
- [x] 2.3 Add cases to `src/tests/types.test.ts`: `delay(1000)` is accepted as a value of `race` / `all` / `allSettled`, `delay("1000")` and passing the result where a promise is expected are errors (`@ts-expect-error` above the line the checker reports); verify with `pnpm tsgo`

## 3. take as a starter

- [x] 3.1 Add the short overloads to `src/effects/take.ts` in the order the file uses (creator without a payload type before one with a payload type), reuse the shared check; verify the `ctx` overloads and `take.test.ts` pass unchanged
- [x] 3.2 Prototype whether `take("name")` infers its payload inside `race(ctx, …)`. Result: it does (the event map comes from the contextual type of the starter), so names and creators are both supported; no change to the spec
- [x] 3.3 Tests in `src/effects/take.test.ts`: the loser of a `race` unsubscribes, `options.signal` and `predicate` work, a guard narrows the result; in `types.test.ts`: the payload type from a creator, the guard narrowing, wrong calls with `@ts-expect-error`

## 4. Trace and plugins

- [x] 4.1 Test in `src/effects/starter-context.test.ts` with the recorder: a `race` with `delay(ms)` / `take(event)` gives the same events (apart from ids, same `parentId`, `rootId`, `traceGroupId`) as the same `race` with `(child) => delay(child, ms)` / `(child) => take(child, event)`
- [x] 4.2 Test that `effectsPlugin({ delay, take })` still binds the `ctx` form: `ctx.delay(1000)` resolves and `ctx.take(event)` returns the payload; add the case to `src/tests/plugin-matrix.test.ts` only if its probes need it, and verify `pnpm vitest run src/tests/plugin-matrix.test.ts`
- [x] 4.3 Check `src/tests/architecture.test.ts` and `src/tests/exports.test.ts` pass: no new import from `src/core` upward, no new export that the public entries do not list

## 5. Docs and release notes

- [x] 5.1 In `docs/effects.md` show the short form in the `race` / `all` examples with one sentence: what a starter is, why `delay(1000)` is not awaited on its own, and that `delay(ctx, 1000)` stays for plain handler code; check any `docs/plugins.md` / `docs/scope.md` snippet that shows the wrapper; verify `pnpm docs:check && pnpm llms:check`
- [x] 5.2 Update the examples in `examples/` that write `(child) => delay(child, …)` or `(child) => take(child, …)` and verify `pnpm tsgo && pnpm check`
- [x] 5.3 Add an `### Added` bullet under `## Unreleased` in `CHANGELOG.md` (one or two lines, link to `docs/effects.md`); verify `node scripts/release-notes.mjs` renders it

## 6. Measure and verify

- [x] 6.1 Run the benchmark of 1.1 again, compare with the baseline, and write the result in the commit message; if the `ctx` path is slower in a way the numbers show, stop and revisit decision 1 of design.md
- [x] 6.2 Run `pnpm build && pnpm size`; compare with 1.2; raise the `effects (all)` limit in `package.json` only if the growth needs it, and say so in the commit message
- [x] 6.3 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; all pass

## Workflow follow-up

- Archive the change (`/opsx:archive`) after review; the `effect-starters` delta becomes `openspec/specs/effect-starters/spec.md`.
- Do not commit unless the owner asks.
