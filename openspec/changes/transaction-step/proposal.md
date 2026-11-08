## Why

The two forms of `transaction` take the steps as data. That has two costs the owner met while using it:

- A step cannot use what an earlier step returned, except through a variable the caller declares outside (`let order; ... order = await ...`). Passing the results as an argument (`run(child, previous)`) was tried: TypeScript cannot infer `previous` from the `run` of the earlier steps in one call, so it would be `any`.
- The type of the value in `rollback` is inferred only in the positional form, and `LeadingOptions`, `StepsOf`, `ValuesOf` and six overloads exist to make that work.

A transaction written as a function that calls `step(run, rollback)` has neither cost: each step is its own call, so the data is a plain variable and `rollback` gets the type of its own `run`. A prototype checked with `tsc --strict` infers both fully, and a wrong rollback type or a typo in `rollbackOn` is a compile error.

## What Changes

- `transaction(ctx, body, options?)` and the starter `transaction(body, options?)` take a function `body(step)`. `step(run, rollback?, options?)` runs `run(child)` as a step of the transaction and returns its value. `rollback` may be `null` or missing; the step options are `rollbackOn` and `rollbackFailure`.
- The result of the scope form is what `body` returns. If `body` throws, a step rejects or the task is aborted, the finished steps are rolled back by the same strategy as in the other forms; there is one implementation of the rollback.
- `step` called after the task is aborted throws the abort reason and starts nothing; `step` called after the transaction ended throws a `TypeError`.
- `effectsPlugin({ transaction })` gives `ctx.transaction(body, options)`.
- The array and the positional forms stay as they are. Nothing breaks.
- Docs present the scope form first, with the recipe for passing data between steps; the other forms are the declarative alternative.

Not in this change (decided with the owner, see `design.md`): a `previous` argument of `run`, a signal or a context for `rollback`, a rollback of the failed step, a single-step `transaction(ctx, run, rollback)`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transaction-effect`: a new call form (a function body with `step`), its result, errors, ordering of rollbacks and the time options are checked; the requirement "Two call forms" says the scope form is one of them, and "Strategy options and their precedence" says a step of the scope form takes `rollbackOn` and `rollbackFailure` too.

## Impact

- `src/effects/transaction.ts` (the scope form and its overloads; `runTransaction` and `rollBack` are shared), `src/effects/plugin.ts` (the bound overload), `src/effects/index.ts` if a type is exported.
- Tests: `src/effects/transaction.test.ts`, `src/tests/transaction.fuzz.test.ts`, `src/tests/types.test.ts`, the plugin test.
- Docs: `docs/effects.md`, `docs/ru/effects.md`, `docs/recipes.md`, `docs/ru/recipes.md`, `llms.txt` if a description changes, `CHANGELOG.md`.
- `package.json`: the size limit of `effects (all)`.
- No change to `nanoeffects` (core), to other effects or to existing signatures.
