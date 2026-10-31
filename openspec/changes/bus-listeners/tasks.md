## 1. Core: the `listeners` member

- [ ] 1.1 Measure `createBus` alone (rolldown, brotli) and `pnpm size` and keep the numbers as the "before" (now 1299 B)
- [ ] 1.2 In `src/core/bus.ts` add `listeners(event)` to the `Bus` type (same event shapes as `on`, result `number`, doc comment with an `@example`) and to the object `createBus` returns: `events.get(eventKey(event)).length`; leave `src/core/store.ts` as it is
- [ ] 1.3 Measure again; put before and after in the commit message; raise the `createBus` entry of `size-limit` only if it fails, to the first value that fits, with the reason (expected 1.35 kB); stop and look again if the cost is over 60 B; check that `pnpm build` and the `notrace` build are unchanged apart from the member
- [ ] 1.4 Unit tests in `src/core`: one listener counted and removed by its unsubscribe, the same function twice counts twice, string / `{ type }` / action creator give the same count, `"*"` is separate from a named event, a never-subscribed event is `0`, `once` is `1` until it runs and `0` after, `once` unbound early is `0`, `off(event)` and `off()` are reflected; run `src/tests/architecture.test.ts`

## 2. Plugins, modules and tasks

- [ ] 2.1 Add a probe to `src/tests/plugin-matrix.test.ts`: one listener through `on`, `once`, a predicate of `matchPlugin` and the `on` of a mounted module gives the expected counts, then `0` after unbinding and unmounting; every order of two and 300 orders of all plugins
- [ ] 2.2 Tests for `devPlugin()` (no double count), `matchPlugin` (a predicate counts under `"*"`), `extendBus` (a class instance's `on` counts, `dispose()` brings it to `0`), `ctx.on` (`0` after the task aborts) and a module's `on` (`0` after unmount); if one of them is not `0`, find the leak and report it before going on
- [ ] 2.3 Types in `src/tests/types.test.ts`: the event shapes of `on` are accepted, a misspelt name is an error on a bus with an event map (`@ts-expect-error` above the first argument), the result is `number`; update `src/tests/exports.test.ts` / `surface.test.ts` if they list the members of a bus

## 3. Use it in the example and the docs

- [ ] 3.1 In `src/tests/chat-widget-example.test.ts` assert that after the chat closes `bus.listeners` of `chat/sent`, `chat/messageAdded` and `chat/typing` is `0` (the panel's `bus.on` calls are unbound by `renderPanel`'s stop function; test the module part with the module mounted and unmounted, and add the panel's if the test renders one)
- [ ] 3.2 In `examples/chat-widget` use `bus.listeners` where it helps the reader (for example the status line of the page shows the count of listeners while the chat is open and closed); keep the example type-checked
- [ ] 3.3 In `docs/chat-widget.md` replace "Check that closing cleans up" step list with one that includes the count of `bus.listeners`; add `listeners` to the bus reference page (the page that lists `on`, `once`, `off`, `emit`) with one minimal example; keep `pnpm docs:check` and `pnpm llms:check` green
- [ ] 3.4 `CHANGELOG.md` under `Unreleased` → `### Added`: `bus.listeners(event)` returns the number of listeners of an event, for tests and dev tools; mention that a hand-made `Bus` object needs the member
- [ ] 3.5 Update `AGENTS.md`: `createBus` size numbers if the limit moved, and one line saying the bus reads its count from the store (not from a plugin) so `once` and wrapped `on` stay right

## 4. Verify

- [ ] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; note the final `createBus` size in the commit message
