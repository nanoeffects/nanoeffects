# Proposal: `bus.emitter(creator)` with `emitterPlugin`

## Why

State managers (Nanostores, MobX, Valtio, Jotai, Zustand) notify through a callback. Today the bridge to the bus is a hand-written arrow: `$name.listen((name) => bus.emit(nameChanged(name)))`. The arrow repeats the bus and the creator at every subscription and the payload type is easy to get wrong. The wanted shape is `$name.listen(bus.emitter(nameChanged))`.

## What Changes

- `emitterPlugin()` in `nanoeffects/actions`: `const bus = createBus().use(emitterPlugin())`. It adds `bus.emitter(creator)` and returns the same bus typed `Bus<E> & EmitterApi<E>`.
- `bus.emitter(creator)` returns a function `(...args) => bus.emit(creator(...args))`. It takes what the creator takes; it does not select, compare or filter values.
- `createAction` stays a plain creator. `bus.emit(creator(value))`, `bus.on(creator, …)` and `bus.emit(creator, value)` mean what they meant.
- Docs: `docs/stores.md` shows Nanostores, MobX, Valtio, Jotai (arrow) and Zustand with `subscribeWithSelector`. Redux keeps `createEffectsMiddleware`.
- Type tests for both overloads of `emitter` and a check that `bus.emit(creator, payload)` is typed for action creators.

## Capabilities

### New Capabilities
- `action-emitter`: turn an action creator into a callback that emits its action on a bus, added by `emitterPlugin`.

### Modified Capabilities

None.

## Non-goals

- A change to `createBus`, `Bus` or any file in `src/core`.
- Bound actions (`bus.action(...)`) where calling the creator emits: it would make `bus.emit(creator(x))` mean something different with and without the plugin.
- A `watch` / `select` / `equals` helper, `when(notEquals, …)`, or per-store adapters.
- Two-way sync between a store and the bus.

## Impact

- `src/actions/emitter.ts` (new, about 40 lines with docs), one export line in `src/actions/index.ts`. `createBus` size does not change.
- Tests: runtime next to the file, types in `src/tests/types.test.ts`.
- `docs/stores.md`, `CHANGELOG.md` (Unreleased); the README stays as it is.
