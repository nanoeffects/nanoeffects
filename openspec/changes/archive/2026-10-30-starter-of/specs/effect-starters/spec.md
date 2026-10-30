## ADDED Requirements

### Requirement: StarterOf types a starter kept in a variable
`nanoeffects/effects` SHALL export the type `StarterOf<E, R = unknown>`, a function that takes the context of a child task on a bus with the events `E` and returns `R` or a promise of `R`. A starter made by `all`, `allSettled`, `race`, `take`, `retry`, `timeout`, `poll` or `delay` without `ctx` and assigned to a variable of this type SHALL type-check, and the checker SHALL take the event map from the variable. The type SHALL have no runtime effect.

#### Scenario: A stored group starter
- **WHEN** `const load: StarterOf<Events> = all({ user: retry(() => loadUser(1)) })` is written outside a group
- **THEN** it type-checks, and `race(ctx, { load })` accepts it in a handler of a bus with the events `Events`

#### Scenario: The result type
- **WHEN** `const user: StarterOf<Events, User> = retry(() => loadUser(1))` is written
- **THEN** `race(ctx, { user })` has `result.user` of the type `User | undefined`

#### Scenario: A wrong result type
- **WHEN** `const user: StarterOf<Events, string> = retry(() => loadUser(1))` is written and `loadUser` returns a `User`
- **THEN** the type checker reports an error

#### Scenario: An inline starter needs none
- **WHEN** `race(ctx, { loaded: all({ user: retry(loadUser) }) })` is written in a handler
- **THEN** it type-checks with no annotation
