# Tasks

## 1. Pokédex

- [x] 1.1 Add `api.listPokemonNames({ signal })` to `shared/api.ts`, and the entity `entities/pokemon-index` (events with the job `loadPokemonIndex`, handler under `timeout` and `retry`, store `{ names, loading, failed }`, module that handles the job and starts it with `module.spawn`). Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.2 Add the feature `features/suggest-pokemon` (event `queryTyped`, store `{ items }`, the pure filter, module, command `clearSuggestions`) and mount both modules in `app.ts`. Verify with `pnpm tsgo`, `pnpm check` and `pnpm vitest run src/tests/architecture.test.ts`.
- [x] 1.3 Rewrite `ui/SearchBox.tsx` as a combobox (typing emits `queryTyped`; arrows, Enter, Escape, click; the search starts on a choice or on Enter; a one-line hint when the list failed) and add the style to `index.html`. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.4 Run the pokédex in a browser: suggestions appear while typing and no request is sent for them, arrows, Enter on a highlight, Enter on `25`, Escape, click, two quick choices leave one card, abilities still load and clear, a network failure of the list shows the hint and Enter still searches. Verify the same results as the spec.

## 2. Rick and Morty

- [x] 2.1 Add `suggestCharacters` to `characters.ts` (and a small request for names in `api.ts` if `getCharacters` does not fit), then the combobox in `App.tsx` and the style in `index.html`. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 2.2 Run Rick and Morty in a browser: suggestions after the quiet time, one request for fast typing and the older one cancelled, a name with no match shows an empty list and no error, a blank box clears the list, arrows, Enter, Escape, click, a choice runs the search, the form still submits with Enter and the button. Verify the same results as the spec.

## 3. Docs and integration

- [x] 3.1 Update `examples/pokedex/README.md` (the table rows and the layers sentence), `examples/rickandmorty/README.md` (a row, and why suggestions have no `retry`), the two rows of `examples/README.md`, and `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.
- [x] 3.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Verify all pass.
