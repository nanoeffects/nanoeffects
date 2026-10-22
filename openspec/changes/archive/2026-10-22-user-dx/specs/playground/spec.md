# playground Specification

## Purpose
Let a reader run the library in a browser tab, without installing anything, to see what a policy does before adopting it.

## ADDED Requirements

### Requirement: The playground opens from the README with no install
The README SHALL link, right after the install section, to a StackBlitz project built from `examples/playground/` of the repository. Opening the link SHALL install the published `nanoeffects` and start the page with no further action.

#### Scenario: A reader opens the link
- **WHEN** a reader opens the playground link
- **THEN** a running page appears that uses `nanoeffects` from npm

#### Scenario: The README stays at levels A and B
- **WHEN** the README is read from top to bottom
- **THEN** the playground is one link with one sentence, and no second demo or new concept is added

### Requirement: The playground shows the search example
The page SHALL run the search flow of `examples/search.ts`: typing waits for quiet with `debounce`, a newer query aborts the older request with `latest`. It SHALL use a fake `api.search` with a delay, and SHALL show, as the reader types, the result of the last query and which earlier requests were aborted.

#### Scenario: Fast typing sends one request
- **WHEN** a reader types "nano" quickly
- **THEN** only one search request starts, for "nano", after the quiet time

#### Scenario: A newer query aborts a slow one
- **WHEN** a reader types a query, waits for its request to start, and then types another
- **THEN** the first request is shown as aborted and only the second result is shown

### Requirement: The playground code is the example code
The handler wiring in the playground SHALL be the wiring of `examples/search.ts` (same imports, same `debounce` and `latest` call), so the two do not teach different things. The playground SHALL carry comments on each library call, as the docs rules require.

#### Scenario: The wiring is the same
- **WHEN** the `bus.on("typed", debounce(..., latest(...)))` block of the playground is compared with the one in `examples/search.ts`
- **THEN** they differ only in the fake `api` and the code that draws the page

### Requirement: The playground does not break the project gates
The playground files SHALL pass `pnpm check` and `pnpm tsgo`, SHALL NOT be part of the published package, and SHALL NOT change anything in `src/`.

#### Scenario: Gates after adding the playground
- **WHEN** `pnpm verify` runs
- **THEN** it passes, and `pnpm pack --dry-run` lists no file of `examples/playground/`
