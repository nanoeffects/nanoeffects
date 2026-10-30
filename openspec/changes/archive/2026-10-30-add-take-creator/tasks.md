# Tasks

## 1. The effect

- [x] 1.1 In `src/effects/take.ts`, add the overloads for a `FreeActionCreator` and an `ActionCreator` (each with and without a type guard predicate), after the name overloads and in the order of `On<E>`, and pass the event on to `ctx.on` as it is. Update the doc comment with an `@example` of the creator form. In `src/effects/plugin.ts`, give the bound `take` the same overloads without `ctx`. Verify with `pnpm tsgo`.
- [x] 1.2 Runtime tests in `src/effects/take.test.ts`: a creator with a payload type resolves with the payload; a creator without one resolves with the payload of the event map; events before the call are ignored; `predicate` skips payloads; `signal` and the abort of the task reject with the reason; the listener is removed after the first match; the bound `take` of `effectsPlugin` takes a creator; the trace of the name form equals the trace of the creator form. Type tests in `src/tests/types.test.ts`: the result from a creator with a payload type, from a free creator and the event map, from an RTK `createAction`, the narrowing by a type guard, and a predicate of the wrong payload rejected with `@ts-expect-error`. Verify with `pnpm vitest run src/effects src/tests/types.test.ts` and `pnpm tsgo`.

## 2. Docs and example

- [x] 2.1 In `docs/effects.md` ("Wait for the next event with `take`") show the creator form in the snippet and say that `take` takes a name or a creator, as `bus.on` does. In `docs/migrating-from-saga.md` change the `take(pattern)` row to `take(ctx, event)` with the creator named, and add the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.
- [x] 2.2 In `examples/counter/src/plain/handlers.ts` and `examples/counter/src/redux/handlers.ts` replace `incrementCancelled.type` with `incrementCancelled` and drop the comment about the name. Verify with `pnpm tsgo`, `pnpm check`, and the cancel scenarios of the counter in a browser.

## 3. Integration

- [x] 3.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build && pnpm size && pnpm smoke && pnpm lint:package`. Verify all pass and the `effects` size limit holds.
