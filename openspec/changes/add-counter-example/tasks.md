# Tasks

## 1. The project

- [x] 1.1 Create `examples/counter/` with `package.json`, `tsconfig.json` (paths to `src`, with `nanoeffects/redux`), `index.html`, `redux.html`, the shared `src/Counter.tsx` and the fake `src/server.ts` (`flaky` and `broken`). Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.2 Write the plain version in `src/plain/` (`bus.ts`, `counter.ts` with the events and the handlers built on `latest`, `race`, `delay`, `take`, `retry` and a `try`/`catch`, and `createBus({ onError })`, and `main.tsx` with the count kept in the page). Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.3 Write the Redux version in `src/redux/` (`slice.ts`, `bus.ts`, `store.ts` with `createEffectsMiddleware`, `handlers.ts` whose handlers differ from the plain ones only in the lines that report a result, and `main.tsx` reading the store with `useSyncExternalStore`). Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.4 Run both pages from a scratch install against the packed package: "+1" adds at once, one click of "+1 after 1 s" adds one after a second, two clicks inside a second add one, "Cancel" while waiting adds nothing, "Cancel" with nothing waiting does nothing, "+1 from a flaky server" adds one after three attempts, "Always fails" shows the message and leaves the count, a newer click during the retries shows no error, and the next "+1" clears the message. Verify in the browser and with `vite build`.

## 2. Docs and index

- [x] 2.1 Write `examples/counter/README.md` (run both pages, the lines that differ, the map to `takeLatest`, `delay`, `race`, `take` and `retry`, a link to [Handle errors](../../docs/errors.md), a note on `react-redux`). Add the row to `examples/README.md`, the pointer in `docs/migrating-from-saga.md` and in the Redux part of `docs/stores.md`, and the line in `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.

## 3. Integration

- [x] 3.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Verify all pass.
