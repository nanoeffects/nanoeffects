## MODIFIED Requirements

### Requirement: The playground has a React variant
The repository SHALL contain a second StackBlitz project, built from `examples/playground-react/`, that runs the same search flow as the DOM playground inside a React component, with no state or helper beyond the bus, the component and the fake API. `examples/README.md` SHALL link to it next to the DOM playground; the main README SHALL NOT carry a second playground link or a second demo block.

#### Scenario: A reader opens the React link
- **WHEN** a reader opens the React playground link from `examples/README.md`
- **THEN** a running page appears that uses `nanoeffects` from npm and React

#### Scenario: Fast typing sends one request
- **WHEN** a reader types "nano" quickly in the React playground
- **THEN** only one search request starts, for "nano", after the quiet time

#### Scenario: A newer query aborts a slow one
- **WHEN** a reader types a query, waits for its request to start, and then types another
- **THEN** the console trace shows the first task as cancelled and only the second result is shown on the page

#### Scenario: The README stays short
- **WHEN** the README is read from top to bottom
- **THEN** it has one playground link (the DOM one) and one link to the examples index

### Requirement: The playground does not break the project gates
Every playground project (`examples/playground/`, `examples/playground-react/` and `examples/playground-devtools/`) SHALL pass `pnpm check` and `pnpm tsgo`, SHALL NOT be part of the published package, and SHALL NOT change anything in `src/`.

#### Scenario: Gates after adding the playground
- **WHEN** `pnpm verify` runs
- **THEN** it passes, and `pnpm pack --dry-run` lists no file of `examples/playground/`

#### Scenario: Gates after adding the React playground
- **WHEN** `pnpm verify` runs
- **THEN** it passes, and `pnpm pack --dry-run` lists no file of `examples/playground/` or `examples/playground-react/`

#### Scenario: Gates after adding the DevTools playground
- **WHEN** `pnpm verify` runs
- **THEN** it passes, and `pnpm pack --dry-run` lists no file of `examples/playground-devtools/`

## REMOVED Requirements

### Requirement: The React playground shows tracing
**Reason**: Tracing to a list on the page and to Redux DevTools made the React example heavy; the React playground now prints to the console and DevTools has its own example.
**Migration**: See "The React playground traces to the console" and "The playground has a Redux DevTools variant".

## ADDED Requirements

### Requirement: The React playground traces to the console
The React playground SHALL create its bus with a tracer held in a constant, `createTracer(consoleLogger())`, with a comment on each library call, and its page text SHALL tell the reader to open the browser console. It SHALL NOT draw the trace on the page or send it to Redux DevTools.

#### Scenario: Console
- **WHEN** a reader types a query in the React playground
- **THEN** the browser console shows the traced tasks of that query

### Requirement: The playground has a Redux DevTools variant
The repository SHALL contain a StackBlitz project built from `examples/playground-devtools/` that runs the search flow of the DOM playground with the bus traced by `reduxDevtools({ name })`. Its page SHALL say that Redux DevTools is a browser extension, that the preview works best in its own tab, and that the instance is picked by its name in the DevTools instance list. `examples/README.md` SHALL link to it.

#### Scenario: With the extension
- **WHEN** a reader opens the preview in its own tab with Redux DevTools installed and picks the instance by its name
- **THEN** the tasks of the search appear there as actions

#### Scenario: No extension
- **WHEN** the page opens in a browser without Redux DevTools
- **THEN** the page works and the search runs
