# Proposal

## Why

The chat and the pokédex are projects with domains, modules and stores. A reader who only wants to see a command at work needs the smaller thing: one search box against a real API, with the whole logic in one file and no store. PotterAPI is open, needs no key and answers with CORS.

## What Changes

- A new example project, `examples/spells/`: React and TypeScript, a search for Harry Potter spells against `potterapi-fedeperin.vercel.app`, with no domains, no modules and no store.
- The search is one command that carries its handler: `createCommand("spells/search", debounce(300, latest(timeout(5000, retry(load)))))`. `bus.emit(searchSpells(query))` returns the spells, and returns `undefined` when the call was dropped by the quiet time or replaced by a newer one. The component keeps the result in `useState` and counts the calls in flight, so the loading flag stays exact when calls overlap.
- `examples/spells/README.md`, a row in `examples/README.md`, a line in `CHANGELOG.md`.

Out of scope: a job (the README says when a job is the better tool and points to the chat), a docs page, tests that call the network, and any change in `src/`.

## Capabilities

### New Capabilities
- `spells-example`: the spells example project.

### Modified Capabilities

## Impact

- New folder `examples/spells/` (not published), type-checked by `pnpm tsgo` and linted by `pnpm check`. It depends on the published `nanoeffects ^0.20.0` and on the network only when it is run.
- `examples/README.md`, `CHANGELOG.md`. No change to `src/`, the package or the size limits.
