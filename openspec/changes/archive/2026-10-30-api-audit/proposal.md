## Why

1.0.0 is a promise that the public surface does not break. Today nothing tells a user which of the 16 entries carry that promise and which are still moving, the rules for what counts as breaking are not written down, and the supported Node, TypeScript and framework versions exist only in CI and `package.json`. The audit also found a few names and forms that are easier to settle before the promise than after it. This change fixes the surface and writes the rules; it adds no feature.

## What Changes

- New page `docs/stability.md`: a table of stable and unstable entries, a semver policy, a support policy, and the call forms that are permanent. It is linked from the docs index and `llms.txt`, not from the README.
- The audit decisions are settled in `design.md`. Result: **no breaking change** in 0.26.0. `RaceStarter` is deprecated in favour of `StarterOf` and goes in 1.0.0; the local type `StarterOf` in `plugin.ts` is renamed (it is not exported); the other items are kept and documented.
- The export lists are pinned by tests for every entry, runtime names and type names, so a later change to the surface is a visible diff.
- Docs say plainly that the three call forms of `retry`, `timeout` and `poll` are permanent, and why `all` takes options only in the `ctx` form.

Out of scope: new features, removing an entry, moving code to other packages, changing the behavior of any call.

## Capabilities

### New Capabilities

- `public-surface`: which entries are stable, what is breaking, which versions are supported, and the pinned list of exports of each entry.

### Modified Capabilities

<!-- None. -->

## Impact

- Docs: new `docs/stability.md`; `docs/README.md` and `llms.txt` link it; a paragraph in `docs/effects.md` on the permanent forms; `docs/oop.md` notes the two meanings of `On`.
- Code: `src/effects/race.ts` (`@deprecated` on `RaceStarter`), `src/effects/plugin.ts` (a local type renamed).
- Tests: `src/tests/exports.test.ts` pins every entry, plus a test for type exports.
- `CHANGELOG.md` under `Unreleased` (Changed, one line). Nothing under Breaking.
- Public API: no removal and no rename; the next release is 0.26.0, 1.0.0 follows a soak period.
