# rickandmorty-example Specification

## Purpose
A browser for Rick and Morty characters with React Query shows how a library for the cache and nanoeffects for the requests split the work in an app that only reads.

## Requirements

### Requirement: React Query owns the screen and nanoeffects owns the requests
`examples/rickandmorty/` SHALL be a React and TypeScript project that starts with `npm run dev` and needs no server of its own. React Query SHALL keep the cache and the state of the screen (`isLoading`, `data`, `error`), and every request SHALL be a nanoeffects command that carries its handler and is run with `bus.emit` from a `queryFn`.

#### Scenario: Run it
- **WHEN** a reader installs the example and runs `npm run dev`
- **THEN** the page lists characters from the API, can search by name, filter by status, load more pages and open the episodes of a character

#### Scenario: The abort reaches the request
- **WHEN** React Query aborts a read, for example when the search changes while a page loads
- **THEN** the task of the command is aborted and the request is cancelled in the browser

### Requirement: Requests are limited and retried
`findCharacters` and `loadEpisodes` SHALL be limited in time (`timeout`) and SHALL try a failed request again (`retry`). A 404 from the character list SHALL NOT be retried: it means "nothing found", and `findCharacters` SHALL return an empty page for it.

#### Scenario: Nothing found
- **WHEN** a reader searches for a name that no character has
- **THEN** the page shows an empty result without an error and without a retry

### Requirement: The example passes the project gates
`examples/rickandmorty/` SHALL pass `pnpm tsgo` and `pnpm check`, with the type check using the sources of `nanoeffects` and the real types of `@tanstack/react-query`, SHALL NOT be part of the published package, and SHALL NOT change anything in `src/`.

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes with the example in the repository
