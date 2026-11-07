# Proposal

## Why

`all` and `allSettled` take `{ concurrency }` in the `ctx` form only. A group that another group starts has no `ctx`, so it cannot be limited: the reader has to write a wrapper, `(child) => all(child, effects, { concurrency: 5 })`. The docs explain it as "a second argument would look like the form with `ctx`". The new `transaction(steps, options)` shows the reason does not hold when the forms can be told apart, and the owner wants the same for `all` and `allSettled`: options in both forms, with no wrapper.

## What Changes

- `all(effects, options)` and `allSettled(effects, options)` are valid: the short form takes the same `options` (`concurrency`) as the `ctx` form. `all(effects)` and `all(ctx, effects, options)` do not change.
- A two-argument call is told by its **first** argument, not by the count. The first argument is a context, and the call is the `ctx` form, when it is not an array and either its `signal` is an abort signal or it has no function value (this keeps `all({}, effects)` and `all({}, [])` as they are). Otherwise it is the effects, and the second argument is the options. One argument and three arguments are decided as before.
- `race` stays as it is: it has no options, so two arguments still mean the `ctx` form. A waiting starter would never run in a `race`, which ends at the first result.
- Docs: the sentence in `docs/effects.md` that says the short form takes no options is replaced by the new rule and an example; the Russian page follows.
- The `public-surface` requirement that makes the docs explain why `all` and `allSettled` take options in the `ctx` form only is changed to explain the rule above.
- `CHANGELOG.md`: one `### Added` bullet under `Unreleased`.

Nothing that is valid today changes meaning: a two-argument call that is valid today has a context first (an object with a `signal`, or `{}`), which the new rule reads as a context.

## Capabilities

### New Capabilities

### Modified Capabilities
- `effect-starters`: the requirement "The form is told by the number of arguments" now says how `all` and `allSettled` tell a two-argument call, and that `race` still tells it by the count.
- `starter-context`: the requirement about `options.concurrency` of `all` and `allSettled` now covers the short form.
- `public-surface`: the requirement for the docs about the call forms now asks them to explain the new rule, in place of "options in the `ctx` form only".

## Impact

- `src/effects/run.ts` (a second helper next to `groupOrStarter`, or a parameter of it; `race` keeps using the count), `src/effects/all.ts` and `src/effects/allSettled.ts` (the short-form overloads take `options`, the implementation passes it on).
- `src/effects/starter-group.test.ts`, `src/effects/concurrency.test.ts`, `src/tests/types.test.ts`, and a fuzz test of the call shapes.
- Docs: `docs/effects.md` (the paragraph that says the short form has no options, and the concurrency paragraph), `docs/ru/effects.md`; check `docs/policies.md`, `docs/recipes.md` and the Russian pages for the wrapper `(child) => all(child, effects, { concurrency })`.
- `CHANGELOG.md` under `Unreleased`. `size-limit`: a few bytes for `effects (all)`; the limit follows the measured number.
- No breaking change.
