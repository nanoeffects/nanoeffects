## Purpose
Show a reader who moves state out of Effector how the replacement looks in code, not only that one exists.

## ADDED Requirements

### Requirement: The Effector page shows the state in Zustand
`docs/migrating-from-effector.md` SHALL include, in the section that rewrites an effect, a complete example where a Zustand store replaces the Effector store of the search (`$items`) and nanoeffects runs the effect. The example SHALL name each piece of the Effector version it replaces, SHALL define every name it uses, and SHALL be a JavaScript block that `pnpm docs:check` verifies against `src`.

#### Scenario: A reader replaces the store
- **WHEN** a reader who keeps Effector for state reads "Rewrite an effect"
- **THEN** they find the search with `debounce` and `latest` that writes its result to a Zustand store and a component that reads that store

#### Scenario: The example stays correct
- **WHEN** `pnpm docs:check` runs
- **THEN** the Zustand block is checked and passes, and is not marked as skipped

### Requirement: The page does not duplicate the Stores page
The example SHALL link to `docs/stores.md` for the two-way wiring of other stores and SHALL NOT repeat it.

#### Scenario: Another store
- **WHEN** a reader uses Redux or MobX instead of Zustand
- **THEN** the page sends them to `stores.md`
