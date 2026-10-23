## REMOVED Requirements

### Requirement: The Stores page shows React sources
**Reason**: The page no longer shows a `useState` source; the requirement below covers Redux `useDispatch` only.
**Migration**: See "The Stores page shows the useDispatch source".

### Requirement: The React sources example is verified
**Reason**: Replaced by the verified requirement below, which names the subsection that remains.
**Migration**: See "The useDispatch example is verified".

## ADDED Requirements

### Requirement: The Stores page shows the useDispatch source
`docs/stores.md` SHALL have a subsection that shows one source of updates in a React component: Redux `dispatch` obtained from `useDispatch`. The example SHALL show how the dispatched action reaches a bus handler and how the handler's result returns to the store. The page SHALL NOT show a `useState` value as a source.

#### Scenario: useDispatch starts a task
- **WHEN** a reader's component calls `dispatch(action)` from `useDispatch` and the store uses the effects middleware
- **THEN** the page shows that the bus handler runs for that action and sends its result back with a dispatch

#### Scenario: No useState source
- **WHEN** the Stores page is read from top to bottom
- **THEN** no example makes a `useState` value emit to the bus

### Requirement: The useDispatch example is verified
The subsection SHALL be titled "React: useDispatch as a source", SHALL link from the "On this page" list with a working anchor, SHALL define every name it uses, and its blocks SHALL be checked by `pnpm docs:check` (a block may be skipped only with a stated reason, for libraries the project does not install).

#### Scenario: Checks
- **WHEN** `pnpm docs:check` and `pnpm llms:check` run
- **THEN** both pass

#### Scenario: The anchor works
- **WHEN** a reader follows the "On this page" entry
- **THEN** it leads to the "React: useDispatch as a source" heading
