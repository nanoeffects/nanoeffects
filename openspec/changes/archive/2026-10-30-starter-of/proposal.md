## Why

A starter written inside a group, `race(ctx, { loaded: all({ … }) })`, gets its child type from the outer group. A starter kept in a variable outside a group has no outer group, so the checker cannot infer the event map and the reader must annotate the variable. Today that annotation is `(child: Context<Events>) => Promise<unknown>`: long, easy to get wrong, and it hides the result type. Docs say "annotate it" and give no short way.

## What Changes

- New exported type `StarterOf<E, R = unknown>` in `nanoeffects/effects`: a starter of a group on a bus with the events `E`, with the result `R`. Use: `const load: StarterOf<Events> = all({ … })`.
- The docs show it next to the note on stored starters, and say that a starter written inline in a group needs no annotation.
- Type only. No runtime change, no change in the bundle.
- **Not breaking**: a new export.

Out of scope: a runtime helper that takes the event map (`all<Events>({ … })`); changing the existing `Starter` type of `src/effects/run.ts`.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `effect-starters`: `StarterOf<E, R>` types a starter kept in a variable. Added requirement, no change to the existing ones.

## Impact

- Code: `src/effects/run.ts` (the type, an alias of `Starter<R, Context<E>>`), `src/effects/index.ts` (export).
- Tests: `src/tests/types.test.ts`; the long annotations in `src/effects/starter-group.test.ts` use the type.
- Docs: `docs/effects.md`; `CHANGELOG.md` under `Unreleased`.
- Size: none, a type is erased.
- Public API: additive, a minor release.
