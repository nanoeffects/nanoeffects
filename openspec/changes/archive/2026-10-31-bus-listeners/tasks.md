## 1. Core: the `get` member

- [x] 1.1 Measure `createBus` alone and `pnpm size` and keep the numbers as the "before" (1299 B)
- [x] 1.2 In `src/core/bus.ts` add `get: Store<E>["get"]` to the `Bus` type (doc comment with an `@example`) and `get: events.get` to the object `createBus` returns; leave the store's `get` as it is
- [x] 1.3 Measure again (1308 B with the member, 1327 B with the optional key); bring it back within 1.3 kB without raising the limit: one `taskOf(action)` helper, a shorter unsubscribe in `store.add`, the order of the properties of the bus object, a shorter `eventKey`, and an inline thenable check on the `onError` path instead of `isPromise`, which keeps `emit` allocation-free (1296 B); `notrace` build unchanged
- [x] 1.3b `get()` with no key gives every listener of every event (`src/core/store.ts`), with a test and a type test
- [x] 1.4 Unit tests in `src/core/bus-get.test.ts`: a listener is listed and its unsubscribe removes it, the same function twice is listed twice, `"*"` is separate from a named event, a never-subscribed event is empty, the creator's `type` works, `once` is listed until it runs and gone when unbound early, `off(event)` and `off()` are reflected, a returned array is not changed later, a module's `on` is gone after unmount, `ctx.on` is gone after abort; run `src/tests/architecture.test.ts`

## 2. Plugins

- [x] 2.1 `modulePlugin` wraps `bus.get` so that it starts the app, and a listener held until then is listed; test it; the `actions` entry grows by 23 B (3285 → 3308 B), so its `size-limit` goes from 3.3 kB to 3.31 kB (3308 B)
- [x] 2.2 Probes in `src/tests/plugin-matrix.test.ts`: a listener through `on` and `once` is listed once whatever the plugins wrap; a predicate of `matchPlugin` is listed under `"*"`; every order of two and 300 orders of all plugins
- [x] 2.3 Types in `src/tests/types.test.ts`: `get` gives `Task<Payload, Events>[]`, accepts `"*"`, a misspelt name is an error (`@ts-expect-error`)

## 3. Use it in the example and the docs

- [x] 3.1 In `src/tests/chat-widget-example.test.ts` assert that `bus.get("chat/sent")` is empty before mount, has one listener while mounted and is empty after unmount
- [x] 3.2 In `examples/chat-widget` a box shows the length of `bus.get(event)` of four events (`chat/sent`, `chat/messageAdded`, `chat/typing`, `chat/closeRequested`) and of `bus.get()` for all events, updated when the chat opens and closes
- [x] 3.3 `docs/guide.md` (the bus section) and `docs/chat-widget.md` mention `bus.get`; `pnpm docs:check` and `pnpm llms:check` stay green
- [x] 3.4 `CHANGELOG.md` under `Unreleased` → `### Added`
- [x] 3.5 `AGENTS.md`: `createBus` is at 1296 B; `bus.get` is the store's `get`; `modulePlugin` starts on `get`

## 4. Verify

- [ ] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`
