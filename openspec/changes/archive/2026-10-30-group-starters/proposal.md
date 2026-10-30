## Why

`delay`, `take`, `retry`, `timeout` and `poll` can be written as starters without a wrapper (changes `curried-starters` and `task-starters`). A group inside a group still needs one: `loaded: (child) => all(child, { user: …, posts: … })`. A nested group is common (load two things together, but give up after a pause), and the wrapper is the same noise the other changes removed.

## What Changes

- `all(effects)`, `allSettled(effects)` and `race(effects)`, called with one argument, return a starter `(child) => Promise`. A group calls it with its child and it runs as `all(child, effects)`. `all(ctx, effects)` and the other `ctx` forms are unchanged.
- Example: `race(ctx, { loaded: all({ user: retry(loadUser), posts: retry(loadPosts) }), waited: delay(5000) })`.
- One argument is the short form, two are the `ctx` form. A single argument that is a context (it has a `signal`) is a mistake and throws a clear `TypeError`.
- Docs show one nested group in `docs/effects.md`.
- **Not breaking**: today `all(x)` with one argument fails (it has no effects), so no working call changes.

Out of scope: a `Task` form of the three effects; other names; `cancellable`.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `effect-starters`: `all`, `allSettled` and `race` without `ctx` are starters. Added requirements, no change to the existing ones.

## Impact

- Code: `src/effects/all.ts`, `allSettled.ts`, `race.ts` (overloads and a one-argument branch); a small helper for the one-argument rule, next to `starter-call.ts`.
- Types: new overloads; `src/tests/types.test.ts`.
- Tests: next to each effect, a trace test through the recorder, a nested cancellation test.
- Docs: `docs/effects.md`; `CHANGELOG.md` under `Unreleased`.
- Size: `effects (all)` is 2.63 kB of 2.7 kB; measured, and the limit moves only if the growth needs it.
- Public API: additive, a minor release.
