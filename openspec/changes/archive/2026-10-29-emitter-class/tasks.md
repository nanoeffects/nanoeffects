# Tasks

## 1. extendBus with no class

- [x] 1.1 Measure the baseline: `pnpm build && pnpm size`; write the brotli size of `oop (class entry)` in the Risks section of design.md. Verify the number is there
- [x] 1.2 Allow `extendBus(bus)` in `src/oop/extend.ts` (the empty base instead of the `TypeError`) and add the overload and its type in `src/oop/types.ts`. Verify `pnpm tsgo`
- [x] 1.3 Add cases to `src/oop/extend.test.ts`: `class Service extends extendBus(bus) {}` has the methods and `Service.bus === bus`, plugin methods used before are there, the one-argument class form is unchanged, and the old `TypeError` case is replaced. Verify `pnpm vitest run src/oop`
- [x] 1.4 Add type checks to `src/tests/types.test.ts`: `extendBus(bus)` instances are `BusMethods<typeof bus>`, a class, a bus and `extendBus(bus, Base)` each pick their overload. Verify `pnpm tsgo`

## 2. The Emitter class

- [x] 2.1 Add `src/oop/emitter.ts` with `Emitter<E>`: prototype methods over the registry of `subscriptions.ts`, a bus for each instance made at first use and kept in a `WeakMap`, the instance `bus` (no static `bus`), `dispose` and `[Symbol.dispose]`; export it from `src/oop/index.ts`. Verify `pnpm tsgo`
- [x] 2.2 Subscribe the `@On`/`@Once` methods from the constructor of `Emitter` with `decoratedOf`, on the bus of the instance. Verify with a decorated subclass in a test
- [x] 2.3 Add `src/oop/emitter.test.ts` for the scenarios of `class-bus`: the methods, own members kept, `dispose` and `Symbol.dispose`, a subscription in a constructor, two instances do not hear each other, a class and its subclass are independent, the bus is the same on every read and made in a parent constructor, no static `bus`, no plugin methods, decorated methods. Verify `pnpm vitest run src/oop`
- [x] 2.4 Add a leak case to `src/oop/leaks.test.ts` for disposed `Emitter` instances. Verify `pnpm vitest run src/oop/leaks`
- [x] 2.5 Add type checks to `src/tests/types.test.ts`: payloads and handler arguments follow `E`, `service.bus` is `Bus<E>`, a wrong payload is a `@ts-expect-error`, an instance fits where an object with `on` and `emit` is wanted. Verify `pnpm tsgo`

## 3. Docs

- [x] 3.1 Rewrite the start of `docs/oop.md`: `Emitter` first (a service whose every instance has a bus of its own, JS example with each nanoeffects call commented), then `extendBus(bus)` for a bus that instances share, then the rest. Say that `Emitter` has no plugin methods, and point to `Subject` in `docs/observable.md`. Verify `pnpm docs:check` and `pnpm llms:check`
- [x] 3.2 Update the JSDoc of `extendBus` and `Emitter` with an `@example`, and the "What is not done" section of `docs/oop.md`: remove the line that one bus for each instance is not part of this entry, because `Emitter` does it. Verify `pnpm docs:check`

## 4. Integration checks

- [x] 4.1 Run `pnpm build && pnpm size`: `oop` is under `2.5 kB`. If it does not fit, stop and ask before changing the limit
- [x] 4.2 Verify `src/tests/architecture.test.ts` and `src/tests/plugin-matrix.test.ts` pass and `createBus` alone has the same size as before
- [x] 4.3 Add the `CHANGELOG.md` lines under `Unreleased` (Added: `Emitter`, `extendBus(bus)`) and run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`

## Workflow follow-up

- Archive the change with `/opsx:archive` after the review.
