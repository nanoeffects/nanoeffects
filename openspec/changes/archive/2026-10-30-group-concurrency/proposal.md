## Why

`all(ctx, ids.map(…))` starts every starter at once. Loading 500 items fires 500 requests together, and the only fix today is to write a pool by hand or to chunk the array. `map` with a `signal` is not the gap (an array of starters already is that); the gap is a limit on how many run together.

## What Changes

- `all` and `allSettled` take a third argument `{ concurrency }` in the `ctx` form: `all(ctx, ids.map((id) => retry(() => loadUser(id))), { concurrency: 5 })`. At most `concurrency` starters run at once; the next one starts when a running one settles.
- The result keeps the order and shape of the starters, as without the option.
- `all` stops on the first failure: running starters are cancelled and the waiting ones are never called. `allSettled` goes on after a failure. Abort of `ctx` stops both.
- The default is no limit, so no call changes. `race` has no `concurrency` (see design).
- Invalid values (`0`, negative, `NaN`, not an integer) throw a `RangeError` before anything starts; `Infinity` means no limit.
- The short form (`all(effects)` as a starter) takes no options in this change.
- Docs show one example in `docs/effects.md`.
- **Not breaking**: a new optional argument.

Out of scope: `concurrency` for `race`, options for the short form, a rate limit (calls per second), priorities.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `starter-context`: `all` and `allSettled` accept `{ concurrency }`. Added requirements, no change to the existing ones.

## Impact

- Code: `src/effects/run.ts` (a scheduler beside `startStarters`), `all.ts`, `allSettled.ts` (overloads and the third argument), `groupOrStarter` (three arguments).
- Types: new overloads; `src/tests/types.test.ts`.
- Tests: next to each effect, a recorder test for the trace, cancellation tests.
- Docs: `docs/effects.md`; `CHANGELOG.md` under `Unreleased`.
- Size: `effects (all)` is 2.73 kB of 2.8 kB; measured, the limit moves only if needed.
- Public API: additive, a minor release.
