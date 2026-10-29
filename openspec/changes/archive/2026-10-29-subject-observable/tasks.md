# Tasks

## 1. The Subject class

- [x] 1.1 Measure the baseline: `pnpm build && pnpm size`; write the brotli size of `observable` in the Risks section of design.md. Verify the number is there
- [x] 1.2 Add the class `Subject` and its source type to `src/observable.ts` (observer handling shared with `createObserve` by a local function, `createObserve` unchanged, `next` bound in the constructor; fields declared and assigned by hand because `erasableSyntaxOnly` forbids parameter properties; the call to `source.emit` goes through a named, narrowly typed step, not a cast inside the call). Verify `pnpm tsgo` and that the existing observable tests pass unchanged
- [x] 1.3 Add cases to `src/observable.test.ts` for the scenarios of `event-subject`: payloads, object observer, `unsubscribe`, lost early events, `next` reaching the source and the subscribers, destructured `next`, `Symbol.observable`, a subclass with a fixed event, a subclass overriding `next` and a destructured override. Verify `pnpm vitest run src/observable`
- [x] 1.4 Add cases for a Subject over an instance of an `extendBus` class and of a `@WithBus` class: `dispose()` ends it, another instance is untouched, a subject made in the constructor of `Base` is tracked (`src/observable.test.ts` or `src/oop/leaks.test.ts`, where the other leak cases are). Verify `pnpm vitest run src/oop src/observable`
- [x] 1.5 Add type checks to `src/tests/types.test.ts`: the payload follows the event map, wrong `next` payload is a `@ts-expect-error`, a bus and an instance of an `extendBus` class both fit as `source`. If the instance does not fit, widen the source type, no cast. Verify `pnpm tsgo`

## 2. Docs

- [x] 2.1 Document `Subject` in `docs/observable.md`: the problem (code written for streams must also push into the bus), one JS example with every nanoeffects call commented, the subclass form, and the limits (no `complete`, `error` or replay). Verify `pnpm docs:check` and `pnpm llms:check`
- [x] 2.2 Add a short section to `docs/oop.md`: `new Subject(this, "typed")` inside a class from `extendBus` or `@WithBus` is ended by `dispose()`, with a link to `docs/observable.md`. Verify `pnpm docs:check`

## 3. Integration checks

- [x] 3.1 Run `pnpm build && pnpm size`: `observable` is under `0.5 kB`; `oop` and `createBus` sizes are the same as before. If the limit does not fit, stop and ask before changing it
- [x] 3.2 Verify `src/tests/architecture.test.ts` passes
- [x] 3.3 Add the `CHANGELOG.md` line under `Unreleased` (Added: `Subject`) and run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`

## Workflow follow-up

- Archive the change with `/opsx:archive` after the review.
