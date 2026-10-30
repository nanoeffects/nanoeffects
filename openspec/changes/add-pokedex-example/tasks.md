# Tasks

## 1. The project

- [x] 1.1 Create `examples/pokedex/` with `package.json`, `tsconfig.json` (with `paths` to `src`), `index.html`, `README.md`, `src/api.ts` (client with `WithSignal` and `HttpError`), `src/bus.ts` and `src/app.ts`. Verify with `pnpm tsgo`.
- [x] 1.2 Add the `pokemon` domain: events (`findPokemon` job, `randomRequested`), handlers (the wrappers of the search, `leading` for random), store, module. Verify with `pnpm tsgo` and `pnpm check`, and against the real API: a name is found, an unknown name is a 404 that is not retried, a newer search aborts the older, and two clicks on random search once.
- [x] 1.3 Add the `abilities` domain: events (`loadAbilities` job), handlers (`allSettled` with `timeout`), store, module that starts on `findPokemon.success`. Verify as above: the abilities appear, one missing ability is named, and a new pokémon aborts the older load.

## 2. The UI and the index

- [x] 2.1 Add `src/main.tsx` and `src/ui/` (search box, random button, card, abilities), thin: components emit events and read stores, none imports the client. Verify with `pnpm tsgo`, `pnpm check`, a `vite build` from a scratch install, and in a browser.
- [x] 2.2 Add the row to `examples/README.md` and the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.

## 3. Integration

- [x] 3.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Verify all pass.
