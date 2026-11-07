# Tasks

## 1. Types first

- [x] 1.1 In `src/tests/types.test.ts` write the type tests before the code: `all({ a: starter }, { concurrency: 2 })`, `all([starter], { concurrency: 2 })`, `allSettled({ a: starter }, null)` return a function for a group and keep the result types inside a group (`all(ctx, { grouped: all({ ... }, { concurrency: 2 }) })`); `all(ctx, effects)`, `all({}, effects)` and `all(controller, [starter])` still return a `Promise`; `race({ a: starter }, { concurrency: 2 })` is an error; `all({ a: starter }, { concurrency: "5" })` is an error. Verify: `pnpm tsgo` fails only for the missing short-form `options` parameter. If a case resolves to the wrong overload, record the fix (overload order or a constraint) in design.md D4 before going on.

## 2. The rule and the overloads

- [x] 2.1 In `src/effects/run.ts` add the reader of the first argument (design D1: not an array, and an object `signal` or no function value is a context) next to `groupOrStarter`, keeping `groupOrStarter` for `race`. The lone-context `TypeError` stays in both. Verify: `pnpm tsgo` passes and `pnpm vitest run src/effects` is still green.
- [x] 2.2 In `src/effects/all.ts` and `src/effects/allSettled.ts` give the short-form overloads `options?: GroupOptions | null`, use the new reader, and pass the options to the group when it is called with its child. Update their doc comments and `@example` (the short form with `{ concurrency }`). Verify: `pnpm tsgo` and the type tests of 1.1 pass.

## 3. Tests of behavior

- [x] 3.1 In `src/effects/starter-group.test.ts` rename "the form is told by the number of arguments" to say the first argument and the count, and add one test for each scenario of `specs/effect-starters/spec.md`: effects and options, an array of effects and options, a context with an array of effects, `null` options, `all({}, {})` stays the `ctx` form, a controller and a task context as the first argument, `race` tells two arguments by the count, a lone context still throws. Verify: `pnpm vitest run src/effects/starter-group.test.ts`, and break the rule (read every two-argument call as the `ctx` form) to see the tests fail.
- [x] 3.2 In `src/effects/concurrency.test.ts` add the scenarios of `specs/starter-context/spec.md`: a limited group inside a `race` (at most 2 in flight), `allSettled(effects, { concurrency })` inside an `all`, a bad value throwing a `RangeError` when the group calls the starter and starting nothing. Verify: `pnpm vitest run src/effects/concurrency.test.ts`.
- [x] 3.3 A fuzz test of call shapes in `src/tests/group-forms.fuzz.test.ts`: random first arguments (a task context, an `AbortController`, `{ signal }`, `{}`, an object of starters, an array of starters, an object with a starter named `signal`) and random second arguments (an object or an array of starters, options, `null`, `undefined`), for `all` and `allSettled`. Compare with the rule written out in the test: the `ctx` form returns a promise that settles with the values, the short form returns a function that runs the same effects with the options when called; and every shape of the old rule (two arguments, a context first) gives the same result as before. Verify: `pnpm vitest run src/tests/group-forms.fuzz.test.ts`, and a deliberately wrong rule (decide by the second argument only) makes it fail.

## 4. Docs

- [x] 4.1 `docs/effects.md`: replace the sentence that says the short form takes no options (design D5), add a short example of `all(effects, { concurrency })` inside a `race` or an outer `all`, and the second-argument note in the concurrency paragraph. Check `docs/policies.md`, `docs/recipes.md` and any page that shows the wrapper `(child) => all(child, effects, { concurrency })` and use the short form there when it reads better. Verify: `pnpm docs:check`.
- [x] 4.2 Mirror 4.1 in `docs/ru/` (read `RUSSIAN-DOCS.md` first; same code blocks with translated comments, the terms of AGENTS.md; do not use the word "starter" in new text, say «функция группы»). Verify: `pnpm docs:check` and `pnpm vitest run tools/docs-site`.
- [x] 4.3 `llms.txt` if a description names the old limit. `CHANGELOG.md`: under `## Unreleased` add `### Added` with one bullet: `all` and `allSettled` take `options` in the form without `ctx`, `all(effects, { concurrency })`; link `docs/effects.md`. Verify: `pnpm llms:check`.

## 5. Size and final check

- [x] 5.1 Run `pnpm build` and `pnpm size`, and set the limit of `effects (all)` in `package.json` from the measured number (a few bytes over the `transaction` figure). Verify: `pnpm size` is green.
- [x] 5.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`. Verify: all pass; `openspec validate all-starter-options --strict` passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` after review; the deltas change `effect-starters`, `starter-context` and `public-surface` in `openspec/specs/`.
