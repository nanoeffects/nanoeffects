# Proposal

## Why

To give a service the methods of a bus, `extendBus(bus, Base)` needs a base class, and a service with nothing to extend has to write `extendBus(class {})`. That reads as a trick: people extend a class with a capital letter, not the result of a call. `extendBus(bus)` without a base throws, so a shared bus has the same problem.

## What Changes

- Add the class `Emitter<E>` to `nanoeffects/oop`: `class VideoService extends Emitter<VideoEvents> {}`. Its instances have `on`, `once`, `off`, `emit`, `dispose`, `[Symbol.dispose]` and `bus`, typed by the event map `E`. Each instance has a bus of its own, made the first time it is used, so every `new VideoService()` is an independent emitter and events of one never reach another. There is no static `bus`.
- Subscriptions made through an instance (and `@On`/`@Once` methods, and a `Subject` made over `this`) end with `dispose()`, as with `extendBus`.
- `extendBus(bus)` with the class omitted returns a class with the methods of that bus over an empty base: `class Service extends extendBus(bus) {}`. Today it throws `TypeError`, so this is additive; `extendBus(Base)` and `extendBus(bus, Base)` are unchanged.
- No methods of plugins on `Emitter` (the bus is made inside, so no plugin is on it); for a bus that instances share, or for plugins, use `extendBus`.
- Docs in `docs/oop.md` and a `CHANGELOG.md` line under `Unreleased`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `class-bus`: `extendBus(bus)` is allowed without the class, and a base class `Emitter<E>` with a bus of its own for each instance is added.

## Impact

- Code: `src/oop/` (a new `emitter.ts`, `index.ts`, the overloads of `extendBus` in `src/oop/extend.ts`, `src/oop/types.ts`). Nothing in `src/core`; `createBus` does not grow.
- Public API: one new class (`Emitter`), one new overload of `extendBus`.
- Size: `nanoeffects/oop` limit `2.5 kB`, measured before and after.
- Tests: `src/oop` tests, `src/tests/types.test.ts`. `architecture.test.ts` and `plugin-matrix.test.ts` are not affected and must stay green.
- Related: `subject-observable` (a `Subject` made over `this` is ended by `dispose()`); the two changes do not depend on each other.
