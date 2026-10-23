## Purpose
Show a reader whose updates start inside React components where the bus call goes, with `useState` and with Redux `useDispatch`.

## ADDED Requirements

### Requirement: The Stores page shows React sources
`docs/stores.md` SHALL have a subsection that shows two sources of updates in one component: a value held by `useState`, and Redux `dispatch` obtained from `useDispatch`. For each, the example SHALL show how the change reaches a bus handler and how the handler's result returns to the state or the store.

#### Scenario: useState starts a task
- **WHEN** a reader's component holds a query in `useState`
- **THEN** the page shows an effect that emits the query to the bus when it changes, and removes its listener on cleanup

#### Scenario: useDispatch starts a task
- **WHEN** a reader's component calls `dispatch(action)` from `useDispatch` and the store uses the effects middleware
- **THEN** the page shows that the bus handler runs for that action and sends its result back with a dispatch

### Requirement: The React sources example is verified
The subsection SHALL link from the "On this page" list, SHALL define every name it uses, and its blocks SHALL be checked by `pnpm docs:check` (a block may be skipped only with a stated reason, for libraries the project does not install).

#### Scenario: Checks
- **WHEN** `pnpm docs:check` and `pnpm llms:check` run
- **THEN** both pass
