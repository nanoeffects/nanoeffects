# Tasks

## 1. Types first

- [x] 1.1 In `src/tests/types.test.ts` write the type tests before the code (design D5): in `transaction(ctx, async (step) => ...)` the value of `step(() => createOrder())` has the type `createOrder` returns and the next step reads `order.id`; `rollback: (order) => ...` gets that type; `step(run)` with no options, `step(run, null, { rollbackOn: "abort" })`; the body's return type is the result type; `transaction(async (step) => ...)` inside `all` and `race` keeps the result type; the bound `ctx.transaction(async (step) => ...)`. Errors with `@ts-expect-error` above the line TypeScript reports: a `rollback` whose parameter does not match the value of `run`, `rollbackOn: "eror"`, `rollbackOn` on the transaction options as `"eror"`, a body with no parameter used as `step`. The array and positional cases that exist stay green. Verify: `pnpm tsgo` fails only for the missing overloads. If a case resolves to the wrong overload, record the fix (overload order) in design.md D5 before going on.

## 2. One implementation of the rollback

- [x] 2.1 In `src/effects/transaction.ts` split `runTransaction` into `inTransaction(ctx, settings, work)` (fork, settle, trace, `try / catch / finally`, `rollBack`, `AggregateError`) and the loop of the array forms as a `work` (design D1). No behavior change. Verify: `pnpm tsgo` and `pnpm vitest run src/effects/transaction.test.ts src/tests/transaction.fuzz.test.ts` pass unchanged.

## 3. The scope form

- [x] 3.1 Add `StepOptions`, `StepFunction` and the two overloads (design D5), the `step` function (design D2: ended → `TypeError`, aborted → abort reason, step options checked, `run` traced, `finished.push` at the end of the step), the `open` flag cleared in `finally`, and the dispatch of D4 before the existing checks in `transaction()`. Settings of the transaction are checked with `settingsOf([], options)` before the body. Export the types the way the other types of the file are exported. Verify: `pnpm tsgo` and the type tests of 1.1 pass.
- [x] 3.2 In `src/effects/plugin.ts` add the overload `(body, options?)` to the bound `transaction` with `Child` as the step's child. Verify: `pnpm tsgo`.

## 4. Tests of behavior

- [x] 4.1 In `src/effects/transaction.test.ts` add `describe("scope form")` with a test for each scenario of `specs/transaction-effect/spec.md`: data through variables, the body returns (no rollback), the signal of a step, the result is the body's value, a later step fails, the body throws after its steps, a step the body catches, abort, a failed rollback (`AggregateError`), both forms give the same calls, `step` after an abort, a saved `step` called late, concurrent steps rolled back in finish order (reverse and parallel), a wrong option of the transaction (the body is not called), a wrong option of a step (the first two steps are rolled back), step options win over the transaction's, `null` falls back, `"stop"` with `"parallel"`. Use the names the file uses (`harness`, `handler`, `gate`). Verify: `pnpm vitest run src/effects/transaction.test.ts`; break the rollback list (push a step before its `run` finishes) and the order test fails.
- [x] 4.2 Add the forms to the dispatch tests (`describe("call forms")`): a function first is the starter with a body; an object then a function is the `ctx` form, `{}` included; `transaction(ctx, fn, fn)` and a function inside a step list still throw the `TypeError`; the starter inside `all`/`race` aborts the body's steps and rolls back (`describe("latest")` style test for a replaced handler). Verify: `pnpm vitest run src/effects/transaction.test.ts`.
- [x] 4.3 In `src/tests/transaction.fuzz.test.ts` generate random steps, options and failures (a failing step, an abort at a random time, a failing rollback) once as an array and once as a scope body, and compare the rollback calls in order, the error and the result. Verify: `pnpm vitest run src/tests/transaction.fuzz.test.ts`, and a deliberately wrong order of rollbacks in the scope form makes it fail.
- [x] 4.4 A test of the bound form in the effects plugin test file: `ctx.transaction(async (step) => ...)` runs the steps in a child of the task and gives the body's value; the array bound form is unchanged. Verify: `pnpm vitest run src/effects`.
- [x] 4.5 A leak check as the existing ones of the file: after the scope form succeeds, fails, is aborted and has a failed rollback, the parent signal has no listener left from the transaction. Verify: `pnpm vitest run src/effects/transaction.test.ts`.

## 5. Docs

- [x] 5.1 `docs/effects.md`, section `transaction` (design D7): lead with the scope form and one real case (order, charge, ship), explain the problem it solves (data between steps, typed rollback), then the array and positional forms as steps as data. Add the rules in one place: a failed step is not rolled back (a step is atomic or cleans up after itself, the key-in-`catch` example), `rollback` has no signal, a step the body catches does not start a rollback, the options of a step are checked at the call, concurrent steps are rolled back in finish order. Update the dispatch paragraph and the `effectsPlugin` line (`ctx.transaction(body, options)`). Comment every nanoeffects call in the snippets, one step per line. Verify: `pnpm docs:check`.
- [x] 5.2 `docs/recipes.md`: the recipe "pass the result of a step to the next one" with the scope form, in the place where the transaction recipe is. Verify: `pnpm docs:check`.
- [x] 5.3 Mirror 5.1 and 5.2 in `docs/ru/effects.md` and `docs/ru/recipes.md` (read `RUSSIAN-DOCS.md` first; code blocks identical except comments; terms of `AGENTS.md`). Verify: `pnpm docs:check` and `pnpm vitest run tools/docs-site`.
- [x] 5.4 `llms.txt` if the description of the effects page names the forms. `CHANGELOG.md`: under `## Unreleased` add `### Added` with one bullet: `transaction(ctx, async (step) => ...)` with `step(run, rollback, options)`, data between steps as variables, `rollback` typed from `run`; link `docs/effects.md#transaction`. Verify: `pnpm llms:check` and `node scripts/release-notes.mjs` reads the section.

## 6. Size and final check

- [x] 6.1 Run `pnpm build` and `pnpm size`, and set the limit of `effects (all)` in `package.json` from the measured number (a few bytes over). If the growth is large, share more with the array forms first (design Risks). Verify: `pnpm size` is green.
- [x] 6.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; load can make the fuzz and `lint-recipes` tests time out (not the code): rerun them alone. Verify: all pass; `openspec validate transaction-step --strict` passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` after review; the delta changes `transaction-effect` in `openspec/specs/`.
