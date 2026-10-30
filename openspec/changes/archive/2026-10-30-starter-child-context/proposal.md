# Proposal

## Why

A starter of `race`, `all`, `allSettled` and `timeout` gets only `{ signal, abort }`. An effect that listens on the bus (`take`) needs a full task context, so inside a starter the reader passes the outer `ctx` for the bus and the starter's signal in the options (`take(ctx, event, { signal })`) and `delay(child, …)` for the rest. Two contexts in one starter are hard to read and easy to mix up.

## What Changes

- A starter of `race`, `all`, `allSettled` and `timeout` receives the child task context of its own run, not a `{ signal, abort }` pair. The child is a real context (`signal`, `abort`, `emit`, `on`, `run`, the fields of the bus), so any effect takes it first: `race(ctx, { waited: (child) => delay(child, 1000), cancelled: (child) => take(child, incrementCancelled) })`.
- The effects that `effectsPlugin` put on `ctx` are on the child too, bound to the child, so a starter can destructure them: `({ delay, take }) => take(incrementCancelled)`. Cancelling the race stops exactly that call.
- Types follow: when `ctx` is a task context, the starter's argument is the context of the child, with the event map of the bus; with `{}` or a bare `{ signal }` it stays `{ signal, abort }`.
- Old starters keep working: `({ signal }) => fetchUser(id, { signal })` is unchanged.
- Docs (`docs/effects.md`, `docs/migrating-from-rxjs.md`) and `examples/counter` use `(child) => effect(child, …)` and the bound form.

## Capabilities

### New Capabilities
- `starter-context`: what a starter of `race`, `all`, `allSettled` and `timeout` receives, and what is on it.

### Modified Capabilities

## Impact

- `src/effects/run.ts`, `race.ts`, `all.ts`, `allSettled.ts`, `timeout.ts`, `plugin.ts` (types of the bound forms), tests next to them and `src/tests/types.test.ts`, `plugin-matrix.test.ts`.
- `createBus` and `src/core` do not change (measure the size to confirm). No new entry.
- Docs, `examples/counter`, `CHANGELOG.md` under `Unreleased`.
- Not breaking: a starter that reads only `signal` and `abort` behaves as before. A starter that passed the whole argument to `JSON.stringify` or spread it would see more keys (accepted).
