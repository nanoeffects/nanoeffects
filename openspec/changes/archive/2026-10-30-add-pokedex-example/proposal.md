# Proposal

## Why

The chat example runs against a server that fails by schedule. Many readers want the other thing: code against a real public API, where the network is unpredictable in its own way, an unknown name answers 404, and a slow answer is a normal day. PokeAPI is open, needs no key and answers with CORS, so an example can call it straight from the browser.

## What Changes

- A new example project, `examples/pokedex/`: React and TypeScript with real requests to `pokeapi.co`, started by `npm run dev`, with no server of its own.
- What it shows, in two domains:
  - `pokemon`: search by name or number. The query waits for quiet (`debounce`) and a newer search aborts the older (`latest`). The request is limited in time (`timeout`) and a failure that is not an answer is tried again (`retry`); a 404 is an answer and is not retried. A job gives the page its loading, found and failed states. A "random pokémon" button is under `leading`, so a second click while the first request runs is dropped.
  - `abilities`: when a pokémon is found, the descriptions of its abilities are loaded together with `allSettled`, each under `timeout`, so one slow or missing ability does not hide the others.
- A thin UI that emits events and reads Zustand stores, and `WithSignal` in the client, as in the chat.
- `examples/pokedex/README.md`, a row in `examples/README.md`, a line in `CHANGELOG.md`.

Out of scope: a docs page (the code is the explanation; the chat has the page), a server, caching, pagination, and any change in `src/`.

## Capabilities

### New Capabilities
- `pokedex-example`: the pokédex example project.

### Modified Capabilities

## Impact

- New folder `examples/pokedex/` (not published), type-checked by `pnpm tsgo` and linted by `pnpm check`. It depends on the published `nanoeffects ^0.20.0` and on the network only when it is run.
- `examples/README.md`, `CHANGELOG.md`. No change to `src/`, the package or the size limits.
