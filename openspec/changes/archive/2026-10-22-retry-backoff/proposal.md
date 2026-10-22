# Proposal: `backoff` helper and a retry backoff recipe

## Why

`retry` already accepts `delay: (attempt, error) => ms`, so exponential growth works today. A cap and jitter are missing, and without jitter all clients retry at the same moment. Every project copies the same few lines, and `docs/effects.md` has only a one-line hint.

## What Changes

- `backoff({ base, factor, max, jitter })` in `nanoeffects/effects`: returns a function for the `delay` option of `retry` (and `poll`). Exponential growth, a cap, optional full jitter.
- Docs: a "Back off between retries" recipe in `docs/effects.md`. It shows the plain `delay` function first, then `backoff` for a cap and jitter.
- A type-checked example in `examples/`, and a `CHANGELOG.md` entry.

## Capabilities

### New Capabilities
- `retry-backoff`: the `backoff` helper that builds the `delay` function for retries.

### Modified Capabilities

None. `retry` and `poll` already take a function as `delay`; their behavior does not change.

## Non-goals

- A `batch` policy and other rxjs/effector ideas (`audit`, `sample`, `distinctUntilChanged`): the owner decided they are not needed.
- Any change in `src/core`, `retry` or `poll`.
- Strategies other than exponential (linear, fibonacci), equal or decorrelated jitter.

## Impact

- New: `src/effects/backoff.ts` (about 30 lines with docs), one export line in `src/effects/index.ts`.
- Tests next to the file. `createBus` size does not change.
- `docs/effects.md`, `examples/`, `CHANGELOG.md` (Unreleased). The README stays as it is.
