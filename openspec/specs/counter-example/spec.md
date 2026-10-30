# counter-example Specification

## Purpose
TBD - created by archiving change add-counter-example. Update Purpose after archive.

## Requirements

### Requirement: The counter example is a small project with two pages
`examples/counter/` SHALL be a React and TypeScript project that starts with `npm run dev`, needs no server and no network, and has two pages with the same buttons and the same events: `index.html` without a store, and `redux.html` with Redux Toolkit. Both pages SHALL show the count, the last error if there is one, and five buttons, "+1", "+1 after 1 s", "Cancel", "+1 from a flaky server" and "Always fails", drawn by one shared component.

#### Scenario: Run it
- **WHEN** a reader installs the example and runs `npm run dev`
- **THEN** `/` and `/redux.html` each show a count of 0 and the five buttons

#### Scenario: The plain increment
- **WHEN** a reader clicks "+1"
- **THEN** the count goes up by one at once

### Requirement: A delayed increment is replaced by a newer one
The handler of "+1 after 1 s" SHALL be wrapped in `latest`. It SHALL wait one second with an effect that gets the `signal` of its task, and then add one. Two clicks inside one second SHALL add one, not two.

#### Scenario: One click
- **WHEN** a reader clicks "+1 after 1 s" once
- **THEN** the count goes up by one after about one second

#### Scenario: Two clicks inside a second
- **WHEN** a reader clicks "+1 after 1 s" twice within one second
- **THEN** the count goes up by one, one second after the second click

### Requirement: Cancel stops the increment that waits
"Cancel" SHALL emit an event that the handler of the delayed increment waits for with `take`, racing it against the wait with `race`, so that the wait is aborted through its `signal` and the count does not change.

#### Scenario: Cancel while waiting
- **WHEN** a reader clicks "+1 after 1 s" and then "Cancel" within one second
- **THEN** the count does not change

#### Scenario: Cancel with nothing waiting
- **WHEN** a reader clicks "Cancel" and no delayed increment waits
- **THEN** nothing happens and the next delayed increment works as usual

### Requirement: A failing call is tried again and then shown as an error
The handler of "+1 from a flaky server" SHALL call a fake function that fails on its first two calls of a click and answers on the third, wrapped in `retry` with three attempts, and SHALL add one when it answers. The handler of "Always fails" SHALL call a function that never answers, and when `retry` gives up, the handler SHALL catch the error and send a `counter/failed` event with its message. The page SHALL show the message of the last error and SHALL clear it at the next increment.

#### Scenario: A call that answers on the third try
- **WHEN** a reader clicks "+1 from a flaky server"
- **THEN** the count goes up by one after the third attempt, and no error is shown

#### Scenario: A call that never answers
- **WHEN** a reader clicks "Always fails"
- **THEN** the count does not change, and the page shows the message of the error after the third attempt

#### Scenario: The error is cleared
- **WHEN** an error is shown and the reader clicks "+1"
- **THEN** the count goes up and the error is gone

### Requirement: An error that no handler caught is isolated
Both buses SHALL be made with an `onError` that writes an error that no handler caught to the console, so that one failing handler does not stop the others.

#### Scenario: An uncaught error is isolated
- **WHEN** a handler of an event throws and does not catch the error
- **THEN** the error is written to the console, and the other handlers of that event still run

### Requirement: The version without a store keeps the count in the page
`index.html` SHALL create the bus with `createBus({ onError })` and no plugin. The handlers SHALL end by emitting a `counter/incremented` or a `counter/failed` event, and the page SHALL add one to its count when it hears the first, keep the message of the second, and stop listening when it is removed.

#### Scenario: No store
- **WHEN** a reader reads the files of `index.html`
- **THEN** they do not import `@reduxjs/toolkit` or `nanoeffects/redux`

### Requirement: The Redux version dispatches through the middleware
`redux.html` SHALL keep the count in a slice made by `createSlice`, SHALL add `createEffectsMiddleware(bus)` to the store, and the handlers SHALL end by dispatching the actions of the slice (the increment, and the failure that keeps the message in the state) through `ctx.store`. The page SHALL read the store with `useSyncExternalStore`, so the example needs no `react-redux`. The buttons SHALL dispatch Redux Toolkit actions, which reach the bus after the reducers.

#### Scenario: The handlers differ in the lines that report a result
- **WHEN** the handler of `index.html` and the handler of `redux.html` are compared
- **THEN** they differ only in the lines that report a result: the emit of `counter/incremented` and `counter/failed` against the dispatch of the actions of the slice

#### Scenario: The middleware sends the actions
- **WHEN** a reader clicks "+1 after 1 s" in `redux.html`
- **THEN** the store gets the request action, the bus runs the handler, and the count in the store goes up after one second

### Requirement: The README maps the example to redux-saga
`examples/counter/README.md` SHALL say how to run both pages, which lines differ between them, and which saga each part replaces (`takeLatest` and `delay` for the delayed increment, `race` and `take` for the cancel, `retry` and `try`/`catch` for the failing call).

#### Scenario: The map is there
- **WHEN** a reader opens the README
- **THEN** it names `takeLatest`, `delay`, `race`, `take` and `retry` next to the lines that replace them

### Requirement: The example passes the project gates
`examples/counter/` SHALL pass `pnpm tsgo` and `pnpm check` with the type check using the sources of `nanoeffects`, SHALL NOT be part of the published package, SHALL NOT add a dependency to the repository, and SHALL NOT change anything in `src/`.

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes with the example in the repository
