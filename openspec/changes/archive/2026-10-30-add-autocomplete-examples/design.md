# Design

## Context

Pokédex today (after the layer change): `shared/api.ts` has `getPokemon` and `getAbilityText`; entities `pokemon` (job `findPokemon`, command `pickRandom`) and `ability`; the feature `show-abilities`; `SearchBox` emits `findPokemon(value)` on every change, and the handler is `debounce(400, latest(timeout(8000, retry(...))))`. Rick and Morty today: `characters.ts` has the commands `findCharacters` and `loadEpisodes` (`timeout`, `retry`), `App.tsx` keeps the filter in `useState` and runs `useInfiniteQuery` with `bus.emit(findCharacters(...), { signal })`. See proposal.md for why only these two examples.

## Goals / Non-Goals

**Goals:**
- Show suggestions where they are a request of their own, with each policy doing a visible job.
- Keep the pokédex layers valid: no import between entities or between features.

**Non-Goals:**
- Fuzzy matching, highlighting, virtual lists, a shared component between the examples.

## Decisions

- **Pokédex: one list, filtered locally.** PokeAPI has no search by part of a name, and a request per key press would be wasteful. `GET /pokemon?limit=100000&offset=0` returns every name in one answer (about 1300 entries), so the list is loaded once and the filter is plain code. This also shows a use for a job that is run once at mount.
- **Pokédex layers.**
  - `entities/pokemon-index`: the job `loadPokemonIndex` (`timeout`, `retry` with the same "an answer is not retried" rule as `pokemon`), its handler, a store `{ names, loading, failed }` and a module that does the work and starts the load with `module.spawn` when it is mounted, as `room` does in the chat.
  - `features/suggest-pokemon`: the event `queryTyped(query)`, a store `{ items }` with `showSuggestions` and `clearSuggestions`, a pure function that filters, and a module that on `queryTyped` reads `pokemonIndexStore.getState().names` and shows the result. A command `clearSuggestions` is bound by the module so a component never writes the store.
  - A feature reading the store of an entity is allowed by the layer rule (a feature imports entities). The architecture test already covers the new folders because it reads the unit folders from disk.
- **The filter.** Lower-case the text and the names; names that start with the text first, then names that contain it, each group in list order, at most six. A blank text gives none. It is a sync function, so there is no `debounce` and no `latest` for the suggestions: there is no request to replace.
- **Why typing stops searching.** With suggestions, partial names such as `pika` would answer 404 and show "No such pokémon" while the reader is still typing. The search starts on a choice or on Enter. `debounce` stays in the handler because two quick choices should still leave one request, and the README keeps that row.
- **The component.** `SearchBox` keeps the typed text and the highlight in `useState`; the suggestions come from `useStore(suggestStore)`. The input has `role="combobox"`, `aria-expanded`, `aria-controls` and `aria-activedescendant`; the list has `role="listbox"` and the items `role="option"` with `aria-selected`. Keys: down/up move the highlight (wrapping), Enter chooses the highlighted name or searches the typed text, Escape clears. A click chooses; the item reacts to `onMouseDown` so the input does not lose focus first.
- **A failed list.** The store sets `failed` and `SearchBox` shows one hint line ("No suggestions: the list of names did not load"). Enter keeps working with the typed text, so the example is no worse than before.
- **Rick and Morty: a command, not a query.** `suggestCharacters` is `createCommand("characters/suggest", debounce(250, latest(timeout(4000, load))))`, where `load` gets `/character/?name=<text>` through the existing `getCharacters` with page 1 and returns the first five `name` values; a 404 returns `[]`, as `findCharacters` does. The component calls it with `bus.emit(suggestCharacters(text))` and no signal: nothing outside the command aborts it, and `latest` aborts the older call itself. The result is `undefined` when the call was dropped or replaced; the component ignores `undefined`.
- **No `retry` for suggestions.** A lost suggestion costs nothing: the next key press asks again. The README says so, next to the rows that show `retry` for the pages.
- **Suggestions are component state.** They are short-lived, belong to one input, and would only fill the React Query cache with entries nobody reads. The page and the episodes stay in React Query, which keeps the example's point: two ways to call a command, one through a query and one directly.
- **Choosing in Rick and Morty.** A choice sets the input value and calls the same `setFilter` that the form uses, so there is one search path. The status select keeps its value.
- **Look.** A small block in each `index.html` (`position: relative` wrapper, an absolutely positioned list, a highlighted item), no dependency.
- **Docs.** Rows in both READMEs, the Layers sentence of the pokédex README (`pokemon-index`, `suggest-pokemon`), the two rows of `examples/README.md`. `docs/query-libraries.md` links the Rick and Morty example without describing its search, so it needs no change.

## Risks / Trade-offs

- [PokeAPI's list is large for a phone] → about 1300 short names (tens of kB) once; the README says what the request is, and the failure path keeps the box usable.
- [A hand-made combobox is easy to get wrong for screen readers] → the roles and `aria-activedescendant` are the standard pattern and are checked in the browser; the example does not claim full accessibility.
- [Typing no longer searches, which changes the pokédex] → recorded in the spec; the hint line of the page says "pick a name or press Enter".
- [A fast second choice] → covered by `latest` in the search handler, and run in the browser.

## Open Questions

None that change the specs.
