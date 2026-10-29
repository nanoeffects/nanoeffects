# Proposal

## Why

`createObserve` gives a bus event as a read-only Observable. A reader who comes from RxJS expects a `Subject`: one object to subscribe to and to push into, and a class they can extend. A class made with `extendBus` has no way to expose its events as a stream, and a subscription made with `createObserve(this.bus)` bypasses the instance registry, so `dispose()` does not end it and it leaks.

## What Changes

- Add the class `Subject` to `nanoeffects/observable`. `new Subject(source, event)` takes any object with `on` and `emit` (a bus, or an instance of a class from `extendBus` or `@WithBus`) and is an Observable of the payloads of `event` with `next(payload)`, which is `source.emit(event, payload)`. No `complete`, no `error`, no replay.
- The class can be extended: `class Typed extends Subject { constructor(bus) { super(bus, "typed"); } }`.
- A `Subject` made over an instance of an `extendBus` class is ended by `dispose()` of that instance, with no change in `nanoeffects/oop`: the instance's own `on` keeps the subscription.
- Docs in `docs/observable.md` (with a pointer from `docs/oop.md`) and a `CHANGELOG.md` line under `Unreleased`.

Nothing is removed and nothing breaks: `createObserve` keeps its signature and behavior, and `nanoeffects/oop` is not changed.

## Capabilities

### New Capabilities
- `event-subject`: a bus event, or an event of an instance of a class from `extendBus`, as a Subject class: an Observable with `next` that can be extended.

### Modified Capabilities

None.

## Impact

- Code: `src/observable.ts` (the class and its types). Nothing in `src/oop` or `src/core`.
- Public API: one new class (`Subject`) and its source type.
- Size: the `observable` entry grows a little (limit `0.5 kB`), measured before and after. `oop` and `createBus` are not touched.
- Layers: `src/observable.ts` already imports only types from `src/core`; `architecture.test.ts` must stay green.
