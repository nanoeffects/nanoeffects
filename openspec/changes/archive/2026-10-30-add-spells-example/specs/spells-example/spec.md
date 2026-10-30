## Purpose

A spells example shows the smallest use of a command that carries its handler: a search box against a real API with no domains, modules or store.

## ADDED Requirements

### Requirement: The spells example is one command and one component
`examples/spells/` SHALL be a React and TypeScript project that starts with `npm run dev`, needs no server of its own, and has no module, store or job. The search SHALL be one command that carries its handler, and the component SHALL read its result from `bus.emit`.

#### Scenario: Run it
- **WHEN** a reader installs the example and runs `npm run dev`
- **THEN** the page lists spells from PotterAPI, and typing narrows the list

#### Scenario: The command returns the result
- **WHEN** the component calls `bus.emit(searchSpells(query))`
- **THEN** it gets the spells for that query, or `undefined` if the call was dropped or replaced

### Requirement: The search does not race and survives a failure
The handler SHALL wait for quiet (`debounce`), keep only the newest search (`latest`), limit the time (`timeout`) and try a failed request again (`retry`). Every request SHALL be a `fetch` that gets the `AbortSignal` of its task, through a `WithSignal` parameter.

#### Scenario: Fast typing sends one request
- **WHEN** a reader types a word quickly
- **THEN** one request starts, for the whole word, after the quiet time

#### Scenario: A newer search replaces the older
- **WHEN** a reader types while a request is running
- **THEN** the older request is cancelled in the browser and only the newer result is shown

### Requirement: The loading flag counts the calls in flight
The component SHALL show "loading" while at least one call has not settled, counting up at each call and down when it settles, so a call that is dropped or replaced does not clear the flag of a call that is still running.

#### Scenario: Overlapping searches
- **WHEN** a reader types so that a dropped call settles while a newer request is running
- **THEN** the page still shows "loading" until the newest request ends

### Requirement: The example passes the project gates
`examples/spells/` SHALL pass `pnpm tsgo` and `pnpm check` with the type check using the sources of `nanoeffects`, SHALL NOT be part of the published package, and SHALL NOT change anything in `src/`.

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes with the example in the repository
