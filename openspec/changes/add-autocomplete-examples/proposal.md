# Proposal

## Why

Both examples have a search box, and a reader who builds one next wants the part that comes right after it: suggestions while typing. Two of the examples are a good place to show it, because there the suggestions are a different request from the result. In the pokédex the box wants an exact name or number, and typing `pika` shows nothing useful. In the Rick and Morty browser the name is sent on Enter, and a list of names under the box would save the round trip. The other examples do not fit: the spells search already returns a list that is its own suggestions, and the chat, the trades and the counter have no text search against an API.

## What Changes

- **Pokédex.** PokeAPI cannot search by part of a name, but one request lists every name (about 1300). The name list is loaded once at mount and filtered in the browser.
  - A new entity `pokemon-index` loads and keeps the names (`loadPokemonIndex`, a job under `timeout` and `retry`).
  - A new feature `suggest-pokemon` turns the typed text into up to six suggestions (names that start with it first, then names that contain it) and exposes a command `clearSuggestions`.
  - `SearchBox` shows the suggestions as an accessible list under the input, with arrows, Enter, Escape and click.
  - **Behavior change.** Typing no longer starts the search by itself, because partial names answer 404 while the reader is still typing. The search starts when a suggestion is chosen or Enter is pressed, so a number such as `25` still works. The search handler keeps `debounce`, `latest`, `timeout` and `retry`.
  - If the name list does not load, the box works as before (Enter searches the typed text) and a one-line hint says why there are no suggestions.
- **Rick and Morty.** A new command `suggestCharacters` asks for the first five names that match the typed text, under `debounce` (250 ms), `latest` and `timeout`, and without `retry`: a lost suggestion is not worth a second request. The suggestions are kept in the component, not in React Query; choosing one fills the input and runs the existing search.
- Docs: the READMEs of both examples, the rows of `examples/README.md`, `CHANGELOG.md` under `Unreleased`.

Out of scope: the other examples, library code, virtual lists, fuzzy matching, highlighting the typed part.

## Capabilities

### New Capabilities

### Modified Capabilities
- `pokedex-example`: the search starts on a choice or Enter instead of on typing; suggestions from a name list loaded once, and keyboard use of them.
- `rickandmorty-example`: suggestions for the name box.
- `example-layers`: the pokédex has one entity and one feature more.

## Impact

- `examples/pokedex/src` (api, two new folders, `SearchBox`, `app.ts`, the `index.html` style), `examples/rickandmorty/src` (api or characters, `App.tsx`, the style), their READMEs, `examples/README.md`, `CHANGELOG.md`.
- The architecture test keeps checking the pokédex layers; no new rule is needed.
- The library, its size limits and the dependencies do not change.
