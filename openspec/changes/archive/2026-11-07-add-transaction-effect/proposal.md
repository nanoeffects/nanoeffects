# Proposal

## Why

A flow of several side effects that must all happen or none ("create an order, charge the card, reserve the stock") has no help in the library today. A handler writes a `try/catch` with a list of rollback functions by hand. It is easy to get wrong when the task is aborted: the rollback must still run, must not get the abort signal, and a handler that a newer call supersedes must not look finished before its rollback is done. The owner asked for it as a first-class effect, next to `all` and `retry`, so the code of a rollback lives in one tested place.

## What Changes

- New effect `transaction(ctx, steps, options?)` in `nanoeffects/effects`. A step is `{ run, rollback }`. Steps run one after another, each `run` in a child task of the group (so it gets a `signal` and shows in the trace). The result is the array of the values of `run`, in step order.
- When a step throws, or the task is aborted, `rollback` is called for the steps that finished, last first. The step that failed is not rolled back (it has no result). `rollback(value)` gets the value its own `run` returned and no abort signal, so a rollback is not cut by the abort that started it. `rollback` is optional.
- **Rollback strategy**, set for the whole effect in `options` and for one step in the step, the step winning:
  - `rollbackOn`: `"error"` (a step failed), `"abort"` (the task was aborted) or `"both"` (default). Decides in which case a rollback is called.
  - `rollbackFailure`: `"continue"` (default) or `"stop"`. Decides whether the rollbacks that are left still run after one has failed.
  - `rollbackOrder`: `"reverse"` (default) or `"parallel"`. Effect only: it is a property of the whole rollback, not of one step.
- A failed rollback never hides the original error: the result rejects with an `AggregateError` that holds the original error and the errors of the rollbacks. Without a failed rollback it rejects with the original error or the abort reason, as every other effect does.
- The result settles only after the last rollback has finished. A `queue` handler therefore frees its slot after the rollback.
- No retry option. `rollback` is a plain callback, so the user wraps it: `rollback: (value) => retry({}, () => api.cancel(value), { times: 3 })`. The docs show it.
- Steps are given as arguments or as an array, and each has a form with `ctx` and a starter form for a group, all with options: `transaction(ctx, options?, ...steps)` and `transaction(options?, ...steps)` (options go before the steps), or `transaction(ctx, steps, options?)` and `transaction(steps, options?)` with an array. With the steps as arguments TypeScript infers the value of each `rollback` from `run` of the same step; in the array form it is `any`. `effectsPlugin({ transaction })` puts the same call forms on `ctx`.
- New trace effect name `transaction` (the group), with each `run` as a child.
- Docs: a section in `docs/effects.md`, a recipe in `docs/recipes.md`, and the Russian pages; `llms.txt`; `CHANGELOG.md` under `### Added`.

Out of scope: durable transactions (state that survives a closed tab), parallel forward steps, a retry option for a rollback, a `transaction` policy or an action option. See design.md.

## Capabilities

### New Capabilities
- `transaction-effect`: run steps with rollback functions, roll the finished ones back on failure or abort by a configurable strategy, and report errors of the rollback.

### Modified Capabilities

## Impact

- `src/effects/transaction.ts` (new), `src/effects/index.ts` (exports for the effect and its two types), `src/core/types.ts` (`EffectName` gets `"transaction"`; a type only), `src/effects/plugin.ts` (the typed bound form).
- Tests: `src/effects/transaction.test.ts`, a fuzz test with an abort at every point and every strategy (`src/tests/transaction.fuzz.test.ts`), `src/tests/exports.test.ts`, `src/tests/surface.test.ts` and `src/tests/types.test.ts`, the plugin matrix probe, a trace test.
- Docs: `docs/effects.md`, `docs/recipes.md`, `docs/migrating-from-saga.md` if it names compensation, `docs/package.md`, `llms.txt`, and the Russian pages of the same names in `docs/ru/`. `CHANGELOG.md` under `Unreleased`.
- `size-limit`: `effects (all)` (3 kB) grows by the measured size of the effect; the limit is raised to the measured value, not guessed. The core and `createBus` are untouched.
- No breaking change.
