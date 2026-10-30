# Proposal

## Why

A reader who comes from redux-saga looks for the counter first: it is the example of its Beginner Tutorial and of its repository (`counter`, `cancellable-counter`), and then for the handling of errors (`error-demo`). The examples of nanoeffects start higher up. The smallest one, `spells`, already has a search, `retry` and `timeout`, and the Redux recipe (`examples/redux.ts`) is 40 lines that nobody can run. There is no small program in which a click starts a delayed job, a second click replaces it, a button cancels it, a call that fails is tried again and then shown as an error, and the same thing is written once without a store and once with Redux Toolkit.

## What Changes

- A new example project, `examples/counter/`: React and TypeScript, a counter with five buttons, "+1", "+1 after 1 s", "Cancel", "+1 from a flaky server" and "Always fails".
  - "+1 after 1 s" starts a handler that waits one second and then adds one. A second click while it waits replaces the first (`latest`, like `takeLatest`). "Cancel" stops the one that waits, through the `signal` of its task (`race` of `delay` and `take`, like `cancellable-counter`).
  - "+1 from a flaky server" calls a fake function that fails on its first two calls and answers on the third. The handler tries it again (`retry`, 3 attempts) and adds one when it answers. "Always fails" calls a function that never answers: after three attempts the handler catches the error and sends a `counter/failed` event, and the page shows the message. A handler that does not catch its error is covered by the `onError` of the bus, which writes the error to the console, so one failing handler cannot stop the others.
  - Two pages of the same project, with the same buttons and the same events. `index.html` keeps the count in the page and sends a `counter/incremented` event from the handler. `redux.html` keeps it in a Redux Toolkit slice, adds `createEffectsMiddleware(bus)`, and the handler dispatches the slice action through `ctx.store`. The two handlers differ in the lines that report a result.
- `examples/counter/README.md` says which line differs, and maps the example to the saga it replaces. A row in `examples/README.md`, a line in `CHANGELOG.md`.
- A short pointer ("See it running") in `docs/migrating-from-saga.md` and in the Redux part of `docs/stores.md`. No new docs page.

Out of scope: the `shopping-cart`, `real-world` and `async` examples of redux-saga, a docs page, tests that call the network (this example has no network), and any change in `src/`.

## Capabilities

### New Capabilities
- `counter-example`: the counter example project, in a version without a store and a version with Redux Toolkit.

### Modified Capabilities

## Impact

- New folder `examples/counter/` (not published), type-checked by `pnpm tsgo` and linted by `pnpm check`. It depends on the published `nanoeffects`, `react`, `react-dom` and `@reduxjs/toolkit`. It does not need `react-redux`: the Redux page reads the store with `useSyncExternalStore`, so the repository gets no new dependency.
- `examples/README.md`, `docs/migrating-from-saga.md`, `docs/stores.md`, `CHANGELOG.md`. No change to `src/`, the package or the size limits.
