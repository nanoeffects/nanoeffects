## ADDED Requirements

### Requirement: The playground has a React variant
The repository SHALL contain a second StackBlitz project, built from `examples/playground-react/`, that runs the same search flow as the DOM playground inside a React component. The README SHALL link to it next to the DOM playground link, in the same sentence, without a new section or a second demo block.

#### Scenario: A reader opens the React link
- **WHEN** a reader opens the React playground link
- **THEN** a running page appears that uses `nanoeffects` from npm and React

#### Scenario: Fast typing sends one request
- **WHEN** a reader types "nano" quickly in the React playground
- **THEN** only one search request starts, for "nano", after the quiet time

#### Scenario: A newer query aborts a slow one
- **WHEN** a reader types a query, waits for its request to start, and then types another
- **THEN** the first request is shown as aborted and only the second result is shown

### Requirement: The React variant keeps the bus outside the component
The bus and its handlers SHALL be created once, at module level, in their own file. The component SHALL subscribe with `bus.on` inside an effect and SHALL remove the listener when it unmounts. The `debounce` and `latest` wiring SHALL be the wiring of `examples/search.ts`, with a comment on each library call.

#### Scenario: The component unmounts
- **WHEN** the search component is unmounted
- **THEN** its listener is removed from the bus and no state update follows

#### Scenario: The wiring is the same
- **WHEN** the `bus.on("typed", debounce(..., latest(...)))` block of the React playground is compared with the one in `examples/search.ts`
- **THEN** they differ only in the fake `api` and the code that draws the page

### Requirement: The React playground shows tracing
The React playground SHALL create its bus with a tracer. It SHALL list, on the page, the traced tasks as they start, finish, are aborted or fail, SHALL print the same events to the browser console, and SHALL send them to Redux DevTools, which does nothing when the extension is absent. The page text SHALL tell the reader where to look (the list, the console, DevTools). The tracer wiring SHALL carry a comment on each library call.

#### Scenario: A newer query aborts a slow one
- **WHEN** a reader types a query, waits for its request to start, and then types another
- **THEN** the trace list shows the first task as cancelled and the second as done

#### Scenario: Console
- **WHEN** a reader types a query in the React playground
- **THEN** the browser console shows the traced tasks of that query

#### Scenario: No extension
- **WHEN** the page opens in a browser without Redux DevTools
- **THEN** the page works and the in-page trace list still fills

#### Scenario: With the extension
- **WHEN** the page opens in a browser with Redux DevTools
- **THEN** the tasks appear there as actions

## MODIFIED Requirements

### Requirement: The playground does not break the project gates
Every playground project (`examples/playground/` and `examples/playground-react/`) SHALL pass `pnpm check` and `pnpm tsgo`, SHALL NOT be part of the published package, and SHALL NOT change anything in `src/`.

#### Scenario: Gates after adding the playground
- **WHEN** `pnpm verify` runs
- **THEN** it passes, and `pnpm pack --dry-run` lists no file of `examples/playground/`

#### Scenario: Gates after adding the React playground
- **WHEN** `pnpm verify` runs
- **THEN** it passes, and `pnpm pack --dry-run` lists no file of `examples/playground/` or `examples/playground-react/`
