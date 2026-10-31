# Proposal

## Why

Closing a feature must leave no subscribers behind (a closed chat widget is the case in `examples/chat-widget`), but nothing on a bus lets anyone check that. The bus keeps its listeners in an internal store, so a test or a dev tool can only watch for side effects, such as a handler that does not run. That proves a handler is quiet today, not that it is gone, and a leaked listener keeps its closure alive.

## What Changes

- Add `bus.get(event)`: the listeners that an event has right now, as the store of the bus holds them (the store's own `get`, passed through). The owner counts them: `bus.get("saved").length`. The key `"*"` gives the any-event listeners, and `bus.get()` with no key gives every listener of every event.
- `modulePlugin` treats a call of `get` as a first use of the app, as it does `emit`, so the listeners it holds until then are visible.
- Use it in `examples/chat-widget` and its test: after unmount, `bus.get("chat/sent")` is empty.
- Mention it in `docs/guide.md` (the bus section) and `docs/chat-widget.md`.
- `createBus` stays within its `size-limit` (1296 B of 1.3 kB): the name is `get` and it is the store's function passed through. The code that pays for it: one helper for the repeated task creation, a shorter `eventKey`, and an inline check for a thenable on the `onError` path instead of the `isPromise` helper.

## Capabilities

### New Capabilities
- `bus-listeners`: reading the listeners of an event on a bus, for tests, dev tools and the "nothing is left subscribed" guarantee.

### Modified Capabilities

None: no existing requirement changes. `bus-subscriptions` and `predicate-subscriptions` keep their behavior; the new capability only reads what they register. `modulePlugin` gains one first-use trigger (`get`), which its own spec does not forbid.

## Impact

- `src/core/bus.ts`: one new member of the `Bus` type and of the object `createBus` returns; the two `createTask` calls become one helper; the `onError` path tells a thenable by its `then` inline, with no `isPromise` import; nothing is allocated for a plain result, as before. `src/core/store.ts`: `get` takes an optional key (all listeners without it) and the unsubscribe of `add` is an expression. `src/core/event.ts`: a shorter `eventKey`.
- `src/actions/module.ts`: a wrapper of `bus.get` starts the app first, as `bus.emit` does; `package.json`: the `actions` size limit goes from 3.3 kB to 3.31 kB (+23 B measured).
- Tests: `src/core/bus-get.test.ts`, `src/tests/plugin-matrix.test.ts` (two probes), `src/tests/types.test.ts`, `src/tests/chat-widget-example.test.ts`.
- Docs: `docs/guide.md`, `docs/chat-widget.md`, `CHANGELOG.md` under `Unreleased` (`### Added`), `AGENTS.md`.
- Not breaking in use. A hand-made object typed as `Bus` needs the member; that is rare and noted in the changelog.
