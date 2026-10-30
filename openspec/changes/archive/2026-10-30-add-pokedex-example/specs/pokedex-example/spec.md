## Purpose

A pokédex example shows requests to a real public API: a search that does not race, a limit of time, a retry that knows an answer from a failure, and several requests that settle together.

## ADDED Requirements

### Requirement: The pokedex example calls PokeAPI from the browser
`examples/pokedex/` SHALL be a React and TypeScript project that starts with `npm run dev` and needs no server of its own. Every request SHALL be a real `fetch` to `pokeapi.co` that gets the `AbortSignal` of its task, written in one client file with a `WithSignal` parameter.

#### Scenario: Run it
- **WHEN** a reader installs the example and runs `npm run dev`
- **THEN** the page has a search box and a button, and searching for `pikachu` shows its card

#### Scenario: An abort reaches the network
- **WHEN** a reader types a second name before the first search has finished
- **THEN** the request of the first is cancelled in the browser

### Requirement: Search waits for quiet and keeps the newest answer
Typing SHALL wait for quiet (`debounce`) and a newer search SHALL abort the older (`latest`). The search SHALL be a job whose outcomes drive the page: loading while it runs, the card when it succeeds, and a message when it fails.

#### Scenario: Fast typing sends one request
- **WHEN** a reader types `pikachu` quickly
- **THEN** one request starts, for the whole name, after the quiet time

#### Scenario: An unknown name
- **WHEN** a reader searches for a name that PokeAPI does not know
- **THEN** the page says there is no such pokémon, and the request is not tried again

### Requirement: A failure that is not an answer is limited and retried
A search request SHALL be limited in time (`timeout`) and SHALL be tried again after a failure that is not an answer from the server (`retry` with `shouldRetry`). A status below 500 SHALL NOT be retried.

#### Scenario: A lost connection is retried
- **WHEN** a request fails without an answer
- **THEN** it is tried again before the page shows an error

### Requirement: The abilities load together and settle one by one
When a pokémon is found, its abilities SHALL be loaded together (`allSettled`), each limited in time (`timeout`), and the page SHALL show the description of each ability that arrived and name the ones that did not.

#### Scenario: One ability is missing
- **WHEN** one of the ability requests fails or is too slow
- **THEN** the other abilities are shown and the missing one is named

#### Scenario: A new pokémon replaces the old abilities
- **WHEN** a second pokémon is found while the abilities of the first are loading
- **THEN** the older load is aborted and only the abilities of the second are shown

### Requirement: A double click on random is dropped
The random button SHALL pick a pokémon number and search for it under `leading`, so that a second click while the first search runs does nothing.

#### Scenario: Two clicks
- **WHEN** a reader clicks the random button twice quickly
- **THEN** one pokémon is searched for

### Requirement: The example passes the project gates
`examples/pokedex/` SHALL pass `pnpm tsgo` and `pnpm check` with the type check using the sources of `nanoeffects`, SHALL NOT be part of the published package, and SHALL NOT change anything in `src/`. Its components SHALL NOT call the client.

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes with the example in the repository
