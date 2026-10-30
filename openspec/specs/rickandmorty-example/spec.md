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

### Requirement: The name box suggests names from a command outside React Query
The name input SHALL show up to five character names that match the typed text. They SHALL come from a nanoeffects command `suggestCharacters` that carries its handler, waits for quiet (`debounce`, 250 ms), keeps only the newest request (`latest`) and limits the time (`timeout`), and SHALL NOT be tried again after a failure. React Query SHALL keep the pages and the episodes only; the suggestions SHALL be state of the component.

#### Scenario: Fast typing sends one request
- **WHEN** a reader types `mor` quickly
- **THEN** one request for suggestions starts after the quiet time, and a newer one cancels the older in the browser

### Requirement: No match and blank text are not errors
A 404 from the name request SHALL mean no match and give an empty list, with no error shown. An empty or blank text SHALL clear the suggestions and send no request.

#### Scenario: No match
- **WHEN** the typed text matches no character
- **THEN** the suggestions are empty and the page shows no error

#### Scenario: Blank text
- **WHEN** a reader clears the box
- **THEN** the suggestions disappear and no request is sent

### Requirement: Choosing a suggestion runs the existing search
The input SHALL be a combobox with a listbox of the suggestions. The arrow keys SHALL move the highlight, Enter SHALL choose the highlighted suggestion (or submit the typed text when none is highlighted), Escape SHALL close the list, and a click SHALL choose a suggestion. Choosing SHALL fill the input and set the same filter as the form does, so the existing query runs. Submitting the form with Enter or the Search button SHALL work as before.

#### Scenario: Pick with the keyboard
- **WHEN** a reader types `mor`, presses the down arrow and Enter
- **THEN** the input holds the first suggestion and the list of characters is searched for that name

#### Scenario: Submit without a suggestion
- **WHEN** a reader types a name and presses Enter with no suggestion highlighted
- **THEN** the form submits and searches for the typed text
