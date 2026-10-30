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
| Type a name | One request starts after 400 ms of quiet; a newer search aborts the older | `debounce`, `latest` |
| Type a name that does not exist | PokeAPI answers 404: the page says so and does not try again | `retry` with `shouldRetry` |
| Lose the connection (switch the network off) | The request is tried again, 3 attempts in all, and fails after 8 s at most | `retry`, `timeout` |
| Find a pokémon | Its abilities load together; one that fails or is slow is named, the others are shown | `allSettled`, `timeout` |
| Click Random twice | One pokémon is searched for | `leading` |

The work is in `src/entities/` and `src/features/`: the entities `pokemon` (the search and the
card) and `ability` (the texts of its abilities), and the feature `show-abilities`, which connects
them: a new search empties the abilities, and a found pokémon loads its own. The two entities do not
import each other. The components only emit events and read the Zustand stores. Open the Network panel
to see an aborted request as cancelled.

PokeAPI is a free service: please keep the requests few, as they are here.
