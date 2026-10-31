# Proposal

## Why

Closing a feature must leave no subscribers behind (a closed chat widget is the case in `examples/chat-widget`), but nothing on a bus lets anyone check that. The bus keeps its listeners in an internal store, so a test or a dev tool can only watch for side effects, such as a handler that does not run. That proves a handler is quiet today, not that it is gone, and a leaked listener keeps its closure alive.

## What Changes

- Add `bus.listeners(event)`: the number of listeners registered for one event key right now. It counts what `on`, `once`, `ctx.on` and the `on` of a module register, and a `once` that has run or been unbound is no longer counted. The key `"*"` counts the any-event listeners.
- Use it in `examples/chat-widget` and its test: after unmount, `listeners` of `chat/sent`, `chat/messageAdded` and `chat/typing` is `0`.
- Mention it in `docs/chat-widget.md` and the bus reference page.
- `createBus` grows by a few bytes, so its `size-limit` entry may move; `design.md` has the measured numbers.

## Capabilities

### New Capabilities
- `bus-listeners`: reading how many listeners an event has on a bus, for tests, dev tools and the "nothing is left subscribed" guarantee.

### Modified Capabilities

None: no existing requirement changes. `bus-subscriptions` and `predicate-subscriptions` keep their behavior; the new capability only reads what they register.

## Impact

- `src/core/bus.ts`: one new member of the `Bus` type and of the object `createBus` returns; `src/core/store.ts` is not changed (it already has `get`).
- `package.json`: `size-limit` of `createBus`, if the measure says so.
- Tests: `src/core` (counts after `on`, `once`, `off`, unsubscribe), `src/tests/plugin-matrix.test.ts` (a probe), `src/tests/types.test.ts`, `src/tests/chat-widget-example.test.ts`, `src/tests/exports.test.ts` if the surface list names bus members.
- Docs: `docs/chat-widget.md`, the bus reference page, `CHANGELOG.md` under `Unreleased` (`### Added`).
- Not breaking: a new optional-to-use member. A bus value built by hand (a custom object typed as `Bus`) would need the member; that is rare and noted in the changelog.
