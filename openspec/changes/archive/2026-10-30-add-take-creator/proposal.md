# Proposal

## Why

`bus.on(creator, handler)` and `ctx.on(creator, handler)` take an action creator as an event. `take(ctx, event)` does not: it asks for the name of the event. A reader of the counter example has to write `take(ctx, incrementCancelled.type, { signal })` next to `bus.on(incrementLaterRequested, …)` and explain why. The creator already knows its name and its payload type, so `take(ctx, incrementCancelled, { signal })` should work, with the payload type taken from the creator.

## What Changes

- `take(ctx, event, options?)` accepts an action creator in place of an event name: a creator with a payload type (`createAction<string>("saved")`, an RTK `createAction`) and a creator without one (`createAction("saved")`, whose payload type comes from the event map of the bus).
- The result and `options.predicate` (with the narrowing by a type guard) work on the payload type of the creator. The string form is unchanged.
- The `take` that `effectsPlugin` puts on the context takes the same arguments.
- `docs/effects.md` shows the creator form in "Wait for the next event with `take`", the saga table in `docs/migrating-from-saga.md` points at it, and the counter example drops `.type`. `CHANGELOG.md` under `Unreleased`.

Out of scope: a predicate over the whole action (`take(ctx, (action) => …)`, the form of `matchPlugin`), commands as the event of `take`, and any change in `src/core` or in the dependencies between layers.

## Capabilities

### New Capabilities

### Modified Capabilities
- `effect-composition`: `take` takes an action creator as its event.

## Impact

- `src/effects/take.ts` (overloads and one line to find the name), `src/effects/plugin.ts` (the type of the bound `take`), their tests, and `src/tests/types.test.ts`.
- `docs/effects.md`, `docs/migrating-from-saga.md`, `examples/counter/src/plain/handlers.ts`, `examples/counter/src/redux/handlers.ts`, `CHANGELOG.md`.
- The size of `createBus` does not change. The `effects` entry grows by a few bytes; the size limit is checked.
