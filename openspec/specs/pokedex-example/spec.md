# pokedex-example Specification

## Purpose
A pokédex example shows requests to a real public API: a search that does not race, a limit of time, a retry that knows an answer from a failure, and several requests that settle together.

## Requirements

### Requirement: The pokedex example calls PokeAPI from the browser
`examples/pokedex/` SHALL be a React and TypeScript project that starts with `npm run dev` and needs no server of its own. Every request SHALL be a real `fetch` to `pokeapi.co` that gets the `AbortSignal` of its task, written in one client file with a `WithSignal` parameter.

#### Scenario: Run it
- **WHEN** a reader installs the example and runs `npm run dev`
- **THEN** the page has a search box and a button, and searching for `pikachu` shows its card

#### Scenario: An abort reaches the network
- **WHEN** a reader types a second name before the first search has finished
- **THEN** the request of the first is cancelled in the browser

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

### Requirement: The search starts on a choice or on Enter and keeps the newest answer
Typing SHALL NOT start a search. A search SHALL start when a suggestion is chosen or Enter is pressed, with the chosen name or the typed text. It SHALL wait for quiet (`debounce`), and a newer search SHALL abort the older (`latest`). The search SHALL be a job whose outcomes drive the page: loading while it runs, the card when it succeeds, and a message when it fails.

#### Scenario: Choosing a suggestion
- **WHEN** a reader types `pika` and chooses `pikachu` from the suggestions
- **THEN** one request starts, for `pikachu`, and its card is shown

#### Scenario: A number with Enter
- **WHEN** a reader types `25` and presses Enter
- **THEN** the search runs for `25`

#### Scenario: Two quick choices
- **WHEN** a reader chooses a second suggestion before the first search has finished
- **THEN** the first request is cancelled and only the card of the second is shown

#### Scenario: An unknown name
- **WHEN** a reader presses Enter on a name that PokeAPI does not know
- **THEN** the page says there is no such pokémon, and the request is not tried again

### Requirement: Typing shows suggestions from a name list that is loaded once
The example SHALL load the list of all pokémon names once, when the app starts, with one request that gets the `AbortSignal` of its task and is limited in time (`timeout`) and tried again after a failure that is not an answer (`retry`). Typing SHALL send no request: it SHALL show up to six suggestions filtered in the browser, the names that start with the typed text first and then the names that contain it, ignoring case. An empty or blank text SHALL show none.

#### Scenario: Suggestions while typing
- **WHEN** a reader types `char`
- **THEN** up to six names appear at once, those that start with `char` before those that only contain it, and no request is sent

#### Scenario: The list is loaded once
- **WHEN** a reader types many times
- **THEN** the list of names was requested once

#### Scenario: The list does not load
- **WHEN** the request for the list fails
- **THEN** the page shows a one-line hint that there are no suggestions, and Enter still searches for the typed text

### Requirement: The suggestions can be used from the keyboard
The input SHALL be a combobox with a listbox of the suggestions. The arrow keys SHALL move the highlighted suggestion, Enter SHALL choose it (or search for the typed text when none is highlighted), Escape SHALL close the suggestions, and a click on a suggestion SHALL choose it. Choosing or pressing Escape SHALL leave the suggestions empty.

#### Scenario: Arrows and Enter
- **WHEN** a reader types `pi`, presses the down arrow twice and Enter
- **THEN** the second suggestion is searched for

#### Scenario: Escape
- **WHEN** a reader presses Escape while suggestions are shown
- **THEN** the suggestions close and the typed text stays
