## REMOVED Requirements

### Requirement: The Stores page shows the useDispatch source
**Reason**: Redux is covered by the first section of the page; the React recipes are about sharing a value.
**Migration**: See "The Stores page shows how to share a value in React".

### Requirement: The useDispatch example is verified
**Reason**: The subsection is renamed.
**Migration**: See "The sharing examples are verified".

## ADDED Requirements

### Requirement: The Stores page shows how to share a value in React
`docs/stores.md` SHALL have a subsection that shows three ways to keep a value that several components read reactively and whose changes reach the bus: `useEmitter` in a Context provider (plain React); a small value store built on `useSyncExternalStore`, for reads outside React; and an atom of a store library with `listen(bus.emitter(...))`. It SHALL show how a handler's result returns to React, and SHALL say, with the reason, not to emit inside a `useReducer` reducer. It SHALL NOT show Redux `useDispatch`.

#### Scenario: Plain React
- **WHEN** a reader keeps the value in `useState` inside a provider
- **THEN** the page shows `useEmitter` called once in the provider and consumers that read the context

#### Scenario: A value read outside React
- **WHEN** a bus handler must read the current value
- **THEN** the page shows the store variant and how the handler gets it from `ctx`

#### Scenario: The reducer warning
- **WHEN** a reader considers calling `bus.emit` inside a reducer
- **THEN** the page says that React may run reducers more than once and shows dispatch followed by `bus.emit` instead

### Requirement: The sharing examples are verified
The subsection SHALL be titled "React: sharing a value across components", SHALL link from the "On this page" list with a working anchor, SHALL define every name it uses except the reader's `api` and, for the atom variant, the store library, and its blocks SHALL be checked by `pnpm docs:check` (a block may be skipped only with a stated reason).

#### Scenario: Checks
- **WHEN** `pnpm docs:check` and `pnpm llms:check` run
- **THEN** both pass, and `docs/package.md` and `llms.txt` list `nanoeffects/react`

#### Scenario: The anchor works
- **WHEN** a reader follows the "On this page" entry
- **THEN** it leads to the "React: sharing a value across components" heading
