# Pokédex example

A React and TypeScript pokédex that calls [PokeAPI](https://pokeapi.co) straight from the browser.
It shows requests to a real public API: a search that does not race, a limit of time, a retry that
knows an answer from a failure, and several requests that settle together.

```bash
npm install
npm run dev
```

| What you do | What happens | Wrappers |
| ----------- | ------------ | -------- |
| Type `char` | Up to six suggestions appear at once, filtered in the browser from a list of all names that was loaded once at start. No request is sent while you type | `timeout`, `retry` (for the list) |
| Pick a suggestion (arrows and Enter, or a click) or press Enter on the text | One request starts after 400 ms of quiet; a newer search aborts the older | `debounce`, `latest` |
| Type a name that does not exist | PokeAPI answers 404: the page says so and does not try again | `retry` with `shouldRetry` |
| Lose the connection (switch the network off) | The request is tried again, 3 attempts in all, and fails after 8 s at most | `retry`, `timeout` |
| Find a pokémon | Its abilities load together; one that fails or is slow is named, the others are shown | `allSettled`, `timeout` |
| Click Random twice | One pokémon is searched for | `leading` |

The work is in `src/entities/` and `src/features/`: the entities `pokemon` (the search and the
card), `ability` (the texts of its abilities) and `pokemon-index` (the list of all names, loaded
once), and the features `show-abilities` and `suggest-pokemon`, which connect them: a new search
empties the abilities, a found pokémon loads its own, and the typed text becomes suggestions from
the list. No two entities import each other, and no two features do. Typing does not search: partial names would answer 404 while you are still typing. If the list of names does not load, the box says so and Enter still searches for the text. The components only emit events and read the Zustand stores. Open the Network panel
to see an aborted request as cancelled.

PokeAPI is a free service: please keep the requests few, as they are here.
