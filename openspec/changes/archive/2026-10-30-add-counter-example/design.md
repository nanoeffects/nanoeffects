# Design

## Context

`examples/spells` is the model for the layout: its own `package.json` with the published `nanoeffects`, a `tsconfig.json` whose `paths` point to `src`, `index.html`, a `README.md`, and a row in `examples/README.md`. The Redux recipe is `docs/stores.md` and `examples/redux.ts`: RTK `createAction` or `createSlice` for the actions, `createEffectsMiddleware(bus)` for the middleware, `ctx.store` in the handlers. `@reduxjs/toolkit` is already a dev dependency of the repository; `react-redux` is not. The tests of the repository do not cover `examples/` (none has tests); the gates are `pnpm tsgo` and `pnpm check`. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- The counter of the saga tutorial, with the delay that `takeLatest` is shown with, and the cancel of `cancellable-counter`.
- The same program without a store and with Redux Toolkit, close enough to be read side by side.

**Non-Goals:**
- A store library tour, a router, a network request.

## Decisions

- **One project, two pages.** `index.html` and `redux.html` are two entries of one Vite project (the dev server serves both; the example has no production build to configure). A mode switch inside one page would put both stores into every file. Two pages keep each file about one version, and the shared component keeps the interface equal.
- **Files.**
  - `src/Counter.tsx`: the shared view. It takes `count`, `error` and the five callbacks, and nothing else, so it knows neither the bus nor Redux.
  - `src/plain/`: `bus.ts` (`createBus()`), `counter.ts` (the events and the handler), `main.tsx` (the page, with a hook that adds one on `counter/incremented`).
  - `src/redux/`: `slice.ts` (`createSlice`, and the request and cancel actions made with RTK `createAction`), `bus.ts`, `store.ts` (`configureStore` with the middleware), `handlers.ts`, `main.tsx` (the page, reading the store with `useSyncExternalStore`).
  - Plain files carry no `redux` in a name or an import, and the Redux files no plain events, so the two versions read as two small apps.
- **The delayed increment.** `latest(async (_, ctx) => { … })` makes a second click replace the first. Inside, `race(ctx, { waited: ({ signal }) => delay({ signal }, 1000), cancelled: ({ signal }) => take(ctx, cancel, { signal }) })` waits for one second or for the cancel event, whichever comes first, and the loser is aborted through its `signal`. If the winner is `waited`, the handler ends with the line that reports the result, the one that differs between the versions: `ctx.emit(counterIncremented())` in the plain version, `ctx.store.dispatch(incremented())` in the Redux version. `race` and `delay` are used in their `ctx` form (as in `docs/effects.md`), so no `effectsPlugin` is needed.
- **The failing call.** `flaky` and `broken` are fake functions in a shared `src/server.ts`. `flaky` fails on its first two calls of a click and answers on the third; `broken` always fails. Both take `{ signal }` like a real client. The handler is `async (_, ctx) => { try { await retry(ctx, () => flaky({ signal: ctx.signal }), { times: 3, delay: 200 }); …report the increment… } catch (error) { …report the failure… } }`, the saga `try`/`catch` around `call` with `retry`. The `catch` reports the failure with `ctx.emit(counterFailed(message))` in the plain version and `ctx.store.dispatch(failed(message))` in the Redux version. An abort (a newer click under `latest`) rejects the same `try`, so the `catch` returns without a report when `ctx.signal.aborted` is set: an aborted task is not a failure.
- **`onError` on the bus.** Both buses are made with `createBus({ onError })` that writes the error to the console. A handler that forgets its `catch` then does not stop the other handlers, which is what `error-demo` of saga is about. `docs/errors.md` is the explanation, and the README links it.
- **Why the cancel is an event and not `ctx.abort()`.** `abort` aborts the task from inside it. A button is outside the task, so the event is the way to reach it, and `take` is what `cancellable-counter` does with `take(STOP)`. The README says so.
- **The count in the plain version.** The bus keeps no values, so the page keeps the count itself: a `useReducer` or `useState` and an effect that calls `bus.on("counter/incremented", …)` and returns the function that stops listening. That is five lines and shows what a bus is. The README says that a value several components read belongs in a store, which is what `redux.html` is.
- **No `react-redux`.** `useSyncExternalStore(store.subscribe, () => store.getState().counter.value)` is the whole connection. It keeps the repository free of a new dependency and shows that the middleware has nothing to do with the binding. The README notes that a real app would use `react-redux`.
- **Actions.** In the Redux version the buttons dispatch RTK actions (`incremented` and `failed` from the slice; `incrementLaterRequested`, `incrementCancelled`, `incrementFlakyRequested` and `incrementBrokenRequested` from `createAction`), the middleware sends them to the bus after the reducers, and the handler listens with `bus.on(incrementLaterRequested, latest(…))`. In the plain version the same names are events of the bus (`createAction` of `nanoeffects/actions`, which only builds the action). The names are equal in both, so a diff of the two folders shows the real differences.
- **Dependencies.** `package.json` lists `nanoeffects`, `react`, `react-dom` and `@reduxjs/toolkit`; the repository type-checks the example against `src` and its own root dev dependencies, so the root `package.json` does not change. `tsconfig.json` is the one of `spells` (paths to `src`, plus `nanoeffects/redux`).
- **Docs.** One sentence with a link in `docs/migrating-from-saga.md` under "Rewrite a saga" and one in the Redux section of `docs/stores.md`. A new page would repeat the README of the example.

## Risks / Trade-offs

- [Two pages double the files] → each page is small (under 60 lines per file) and the shared view carries the interface.
- [`useSyncExternalStore` by hand looks unusual] → one commented line; the README says that `react-redux` does the same.
- [An abort is mistaken for a failure] → the `catch` checks `ctx.signal.aborted` first, and the check in the tasks covers a newer click during the retries.
- [Readers expect a real async call] → the 1 s delay is the saga tutorial's own; a request is already shown by `spells` and `pokedex`, and the README links both.

## Open Questions

None that change the specs.
