## Why

Inside `race`, `all` and `allSettled` the two most common starters are a wait and a wait for an event. Each needs a wrapper that only passes the child context on: `waited: (child) => delay(child, 1000)`, `cancelled: (child) => take(child, incrementCancelled)`. The wrapper is noise, and a reader has to work out that `child` must be forwarded. `retry`, `timeout` and `poll` already have a second form that drops `ctx` (the Task form); `delay` and `take` have none.

## What Changes

- `delay(ms)` returns a starter, `(child) => Promise<void>`. `delay(ctx, ms)` is unchanged.
- `take(event, options?)` returns a starter, `(child) => Promise<payload>`. `take(ctx, event, options?)` is unchanged. `event` is a name or an action creator, as today.
- The short form is for the values of `race`, `all`, `allSettled` and for `timeout(ctx, ms, starter)`. It is told from the `ctx` form by the first argument alone (an object is a context; a number, a string or a function is not), as `retry` and `timeout` already do.
- The starter does all its work when the group calls it, not when it is created, so the trace is the same as for `(child) => delay(child, 1000)`.
- Docs recommend the short form inside a group, and keep `delay(ctx, ms)` for plain handler code.
- **Not breaking**: no existing call changes its result or its type.

Out of scope: the other effects (`retry`, `timeout`, `poll`, `all`, `race`) get no new form; the Task form of `retry` / `timeout` / `poll` is unchanged; no generic `curry` helper.

## Capabilities

### New Capabilities

- `effect-starters`: `delay` and `take` as ready-made starters: the short form, how it is told from the `ctx` form, what it does when it is reused, and how it is traced.

### Modified Capabilities

<!-- None: the specs `starter-context` and `effect-composition` stay as they are; the new form only relies on them. -->

## Impact

- Code: `src/utils/delay.ts`, `src/effects/take.ts` (overloads and a small shared check of the first argument); `src/effects/plugin.ts` only if the bound `delay` / `take` types need to stay as they are (they must).
- Types: new overloads; `src/tests/types.test.ts`.
- Tests: next to `delay` / `take`, a trace test through the recorder, a case in `starter-context.test.ts`.
- Docs: `docs/effects.md` (the `race` / `all` examples), `docs/plugins.md` if it shows a wrapper; `CHANGELOG.md` under `Unreleased`; examples that use the wrapper are updated and type-checked.
- Size: the `effects (all)` limit in `package.json` (2.5 kB brotli) is measured before and after; `createBus` is untouched.
- Public API: additive, a minor release.
